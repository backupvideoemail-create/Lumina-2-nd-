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

/**
 * Google Play Billing Manager (PBL 9.1.0 compliant)
 * Handles both:
 * 1. One-time In-App Products (e.g. plan_intro_daily - 24-hour Intro Pass, top-up packs)
 * 2. Recurring Subscriptions (e.g. sub_weekly_creator, sub_monthly_creator)
 */
class BillingManager(
    private val context: Context,
    private val repository: AppRepository,
    private val scope: CoroutineScope
) : PurchasesUpdatedListener, BillingClientStateListener {

    private val billingClient = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()

    private val _isReady = MutableStateFlow(false)
    val isReady: StateFlow<Boolean> = _isReady.asStateFlow()

    private val _productDetailsList = MutableStateFlow<List<ProductDetails>>(emptyList())
    val productDetailsList: StateFlow<List<ProductDetails>> = _productDetailsList.asStateFlow()

    private val _purchaseStatus = MutableStateFlow<String?>(null)
    val purchaseStatus: StateFlow<String?> = _purchaseStatus.asStateFlow()

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
        }
    }

    override fun onBillingServiceDisconnected() {
        _isReady.value = false
    }

    /**
     * Query both Subscriptions and One-Time Products using PBL 9 QueryProductDetailsResult
     */
    private fun queryAllProducts() {
        val allFetched = mutableListOf<ProductDetails>()

        // 1. One-Time In-App Products:
        // - "plan_intro_daily": Locked Business Rule: One-time ₹1 / 24-hour Intro Pass (NOT a recurring subscription!)
        // - Top-up credit packs
        val inAppProducts = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId("plan_intro_daily")
                .setProductType(BillingClient.ProductType.INAPP)
                .build(),
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
            if (inAppResult.responseCode == BillingClient.BillingResponseCode.OK) {
                allFetched.addAll(queryResult.productDetailsList)
            }

            // 2. Subscriptions: Weekly and Monthly recurring plans
            val subProducts = listOf(
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
                if (subResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    allFetched.addAll(subQueryResult.productDetailsList)
                }
                _productDetailsList.value = allFetched.toList()
            }
        }
    }

    /**
     * Launch purchase flow for either a Subscription or a One-Time Product
     */
    fun launchBillingFlow(activity: Activity, productDetails: ProductDetails) {
        val offerToken = if (productDetails.productType == BillingClient.ProductType.SUBS) {
            productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken
        } else {
            productDetails.oneTimePurchaseOfferDetailsList?.firstOrNull()?.offerToken
        }

        val productDetailsParamsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(productDetails)

        if (!offerToken.isNullOrEmpty()) {
            productDetailsParamsBuilder.setOfferToken(offerToken)
        }

        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productDetailsParamsBuilder.build()))
            .build()

        billingClient.launchBillingFlow(activity, billingFlowParams)
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
            val productId = purchase.products.firstOrNull() ?: "plan_intro_daily"

            scope.launch(Dispatchers.IO) {
                _purchaseStatus.value = "Verifying purchase with server..."
                val result = repository.verifyGooglePlayPurchase(
                    productId = productId,
                    purchaseToken = purchase.purchaseToken,
                    orderId = purchase.orderId
                )

                if (result.isSuccess) {
                    _purchaseStatus.value = "Success! Credits synced."

                    // Determine if the product is a consumable one-time purchase or a subscription
                    val isOneTime = productId == "plan_intro_daily" || productId.startsWith("topup_")

                    if (isOneTime) {
                        // Consume one-time purchase so user can purchase again if needed
                        val consumeParams = ConsumeParams.newBuilder()
                            .setPurchaseToken(purchase.purchaseToken)
                            .build()
                        billingClient.consumeAsync(consumeParams) { consumeResult, _ ->
                            // One-time item consumed on Google Play
                        }
                    } else {
                        // Acknowledge subscription purchase with Google Play
                        if (!purchase.isAcknowledged) {
                            val acknowledgePurchaseParams = AcknowledgePurchaseParams.newBuilder()
                                .setPurchaseToken(purchase.purchaseToken)
                                .build()
                            billingClient.acknowledgePurchase(acknowledgePurchaseParams) { ackResult ->
                                // Subscription acknowledged
                            }
                        }
                    }
                } else {
                    _purchaseStatus.value = "Verification error: ${result.exceptionOrNull()?.message}"
                }
            }
        } else if (purchase.purchaseState == Purchase.PurchaseState.PENDING) {
            _purchaseStatus.value = "Payment is pending Google Play processing. Credits will activate once confirmed."
        }
    }
}
