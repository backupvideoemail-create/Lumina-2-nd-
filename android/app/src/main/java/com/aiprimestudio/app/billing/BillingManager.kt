package com.aiprimestudio.app.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.*
import com.aiprimestudio.app.data.repository.AppRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

/**
 * Google Play Billing Manager (Play Billing Library 8.0.0 compliant)
 * Handles:
 * 1. Subscriptions:
 *    - sub_double_bonanza_weekly: Weekly recurring subscription with verified ₹1 24h introductory offer
 *    - sub_weekly_creator: Weekly recurring subscription (₹199 / 230 credits)
 *    - sub_monthly_creator: Monthly recurring subscription (₹998 / 1200 credits)
 * 2. In-App Consumable Products:
 *    - topup_49, topup_99, topup_199, topup_399 (Credits never expire)
 * 3. Pending purchase handling, Restore Purchases, and server-side verification with idempotency.
 */
class BillingManager(
    private val context: Context,
    private val repository: AppRepository,
    private val scope: CoroutineScope
) : PurchasesUpdatedListener, BillingClientStateListener {

    private val billingClient = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .build()

    private val _isReady = MutableStateFlow(false)
    val isReady: StateFlow<Boolean> = _isReady.asStateFlow()

    private val _productDetailsList = MutableStateFlow<List<ProductDetails>>(emptyList())
    val productDetailsList: StateFlow<List<ProductDetails>> = _productDetailsList.asStateFlow()

    private val _purchaseStatus = MutableStateFlow<String?>(null)
    val purchaseStatus: StateFlow<String?> = _purchaseStatus.asStateFlow()

    // Deduplication map to prevent double-processing in-flight tokens
    private val processedTokens = ConcurrentHashMap.newKeySet<String>()

    init {
        startConnection()
    }

    fun startConnection() {
        billingClient.startConnection(this)
    }

    override fun onBillingSetupFinished(billingResult: BillingResult) {
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            _isReady.value = true
            queryAllProducts()
            restorePurchases()
        }
    }

    override fun onBillingServiceDisconnected() {
        _isReady.value = false
        // Reconnect when disconnected
        startConnection()
    }

    /**
     * Query both Subscriptions and One-Time Products using PBL 8.0.0
     */
    fun queryAllProducts() {
        val allFetched = mutableListOf<ProductDetails>()

        // 1. In-App Consumable Products (Top-Ups)
        val inAppProducts = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId("topup_49")
                .setProductType(BillingClient.ProductType.INAPP)
                .build(),
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId("topup_99")
                .setProductType(BillingClient.ProductType.INAPP)
                .build(),
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId("topup_199")
                .setProductType(BillingClient.ProductType.INAPP)
                .build(),
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId("topup_399")
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        )

        val inAppParams = QueryProductDetailsParams.newBuilder()
            .setProductList(inAppProducts)
            .build()

        billingClient.queryProductDetailsAsync(inAppParams) { inAppResult, queryResult ->
            if (inAppResult.responseCode == BillingClient.BillingResponseCode.OK && queryResult != null) {
                queryResult.productDetailsList?.let { details ->
                    allFetched.addAll(details)
                }
            }

            // 2. Subscriptions: Double Bonanza Weekly + Creator Weekly + Creator Monthly
            val subProducts = listOf(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId("sub_double_bonanza_weekly")
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build(),
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId("sub_weekly_creator")
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build(),
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId("sub_monthly_creator")
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()
            )

            val subParams = QueryProductDetailsParams.newBuilder()
                .setProductList(subProducts)
                .build()

            billingClient.queryProductDetailsAsync(subParams) { subResult, subQueryResult ->
                if (subResult.responseCode == BillingClient.BillingResponseCode.OK && subQueryResult != null) {
                    subQueryResult.productDetailsList?.let { details ->
                        allFetched.addAll(details)
                    }
                }
                _productDetailsList.value = allFetched.toList()
            }
        }
    }

    /**
     * Checks if the ₹1 introductory offer is eligible and available on Google Play for this user account.
     */
    fun isIntroOfferAvailable(productDetails: ProductDetails): Boolean {
        if (productDetails.productId != "sub_double_bonanza_weekly") return true
        return productDetails.subscriptionOfferDetails?.any { offer ->
            offer.pricingPhases.pricingPhaseList.any { phase ->
                phase.priceAmountMicros == 1_000_000L &&
                (phase.billingCycleCount == 1 || phase.billingPeriod == "P1D")
            }
        } ?: false
    }

    /**
     * Launch purchase flow for either a Subscription or a One-Time Product.
     * For Double Bonanza: strictly requires the verified ₹1 (1,000,000 micros) introductory offer token.
     */
    fun launchBillingFlow(activity: Activity, productDetails: ProductDetails) {
        val productDetailsParamsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(productDetails)

        if (productDetails.productType == BillingClient.ProductType.SUBS) {
            val offerToken = if (productDetails.productId == "sub_double_bonanza_weekly") {
                // Strict check: exactly 1 INR (1,000,000 micros) introductory phase
                val introOffer = productDetails.subscriptionOfferDetails?.find { offer ->
                    offer.pricingPhases.pricingPhaseList.any { phase ->
                        phase.priceAmountMicros == 1_000_000L &&
                        (phase.billingCycleCount == 1 || phase.billingPeriod == "P1D")
                    }
                }
                if (introOffer == null) {
                    _purchaseStatus.value = "Introductory offer (₹1) is not eligible or unavailable for this Google account. Cannot charge full base price without user consent."
                    return
                }
                introOffer.offerToken
            } else {
                productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken
            }

            if (offerToken.isNullOrEmpty()) {
                _purchaseStatus.value = "No valid offer available for this product on Google Play."
                return
            }
            productDetailsParamsBuilder.setOfferToken(offerToken)
        }

        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productDetailsParamsBuilder.build()))
            .build()

        billingClient.launchBillingFlow(activity, billingFlowParams)
    }

    /**
     * Restores active subscriptions and unconsumed top-ups from Google Play.
     */
    fun restorePurchases() {
        if (!_isReady.value) return
        scope.launch(Dispatchers.IO) {
            val subsParams = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build()

            billingClient.queryPurchasesAsync(subsParams) { result, purchases ->
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    for (purchase in purchases) {
                        handlePurchase(purchase)
                    }
                }
            }

            val inAppParams = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build()

            billingClient.queryPurchasesAsync(inAppParams) { result, purchases ->
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    for (purchase in purchases) {
                        handlePurchase(purchase)
                    }
                }
            }
        }
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: List<Purchase>?) {
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (purchase in purchases) {
                handlePurchase(purchase)
            }
        } else if (billingResult.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
            _purchaseStatus.value = "Purchase cancelled"
        } else {
            _purchaseStatus.value = "Billing response (${billingResult.responseCode}): ${billingResult.debugMessage}"
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            val token = purchase.purchaseToken
            if (processedTokens.contains(token)) {
                return
            }
            processedTokens.add(token)

            val productId = purchase.products.firstOrNull()
            if (productId.isNullOrBlank()) {
                processedTokens.remove(token)
                _purchaseStatus.value = "Purchase verification error: missing product ID on Google Play purchase."
                return
            }

            scope.launch(Dispatchers.IO) {
                _purchaseStatus.value = "Verifying purchase with server..."
                val result = repository.verifyGooglePlayPurchase(
                    productId = productId,
                    purchaseToken = purchase.purchaseToken,
                    orderId = purchase.orderId
                )

                if (result.isSuccess) {
                    val isTopUp = productId.startsWith("topup_")

                    if (isTopUp) {
                        // Consumable top-up: confirm local BillingClient consume completes cleanly or allow retry
                        val consumeParams = ConsumeParams.newBuilder()
                            .setPurchaseToken(purchase.purchaseToken)
                            .build()
                        billingClient.consumeAsync(consumeParams) { consumeResult, _ ->
                            if (consumeResult.responseCode == BillingClient.BillingResponseCode.OK ||
                                consumeResult.responseCode == BillingClient.BillingResponseCode.ITEM_NOT_OWNED
                            ) {
                                _purchaseStatus.value = "Success! Credits synced."
                            } else {
                                // Backend verification already consumed/verified; allow client retry cleanly if Play cache lags
                                processedTokens.remove(token)
                                _purchaseStatus.value = "Credits verified on server, but Play consume sync returned (${consumeResult.responseCode}). Tap Restore Purchases to resync."
                            }
                        }
                    } else if (!purchase.isAcknowledged) {
                        // Auto-renewing subscriptions: ensure local Play BillingClient acknowledgement also confirms OK
                        val acknowledgePurchaseParams = AcknowledgePurchaseParams.newBuilder()
                            .setPurchaseToken(purchase.purchaseToken)
                            .build()
                        billingClient.acknowledgePurchase(acknowledgePurchaseParams) { ackResult ->
                            if (ackResult.responseCode == BillingClient.BillingResponseCode.OK) {
                                _purchaseStatus.value = "Success! Credits synced."
                            } else {
                                processedTokens.remove(token)
                                _purchaseStatus.value = "Purchase verified, awaiting Google Play acknowledgement (${ackResult.responseCode}). Tap Restore Purchases to finalize."
                            }
                        }
                    } else {
                        _purchaseStatus.value = "Success! Credits synced."
                    }
                } else {
                    processedTokens.remove(token)
                    _purchaseStatus.value = "Verification error: ${result.exceptionOrNull()?.message}"
                }
            }
        } else if (purchase.purchaseState == Purchase.PurchaseState.PENDING) {
            _purchaseStatus.value = "Payment is pending Google Play processing. Credits will activate once confirmed."
        } else {
            _purchaseStatus.value = "Purchase status is not completed (${purchase.purchaseState}). Please retry or check Google Play."
        }
    }
}
