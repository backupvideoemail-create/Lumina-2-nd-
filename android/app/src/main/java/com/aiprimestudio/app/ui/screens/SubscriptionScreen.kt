package com.aiprimestudio.app.ui.screens

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aiprimestudio.app.billing.BillingManager
import com.aiprimestudio.app.data.repository.AppRepository
import com.aiprimestudio.app.ui.theme.*

data class PlayPlan(
    val id: String,
    val title: String,
    val price: String,
    val priceValue: Int,
    val period: String,
    val credits: Int,
    val creditSubtitle: String,
    val badge: String?,
    val isPopular: Boolean = false,
    val disclosureText: String
)

@Composable
fun SubscriptionScreen(
    repository: AppRepository,
    billingManager: BillingManager
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val user by repository.currentUser.collectAsState()
    val productDetailsList by billingManager.productDetailsList.collectAsState()
    val purchaseStatus by billingManager.purchaseStatus.collectAsState()

    var selectedPlanId by remember { mutableStateOf("sub_double_bonanza_weekly") }

    val plans = listOf(
        PlayPlan(
            id = "sub_double_bonanza_weekly",
            title = "Double Bonanza",
            price = "₹1",
            priceValue = 1,
            period = "24h Intro, then ₹499/week",
            credits = 40,
            creditSubtitle = "40 credits for 24h, then 400 credits / 7 days",
            badge = "TRAIL OFFER",
            isPopular = true,
            disclosureText = "₹1 for the first 24 hours, then ₹499 every 7 days until cancelled. Auto-renews. Intro credits expire after 24 hours; each verified renewal grants 400 credits valid for 7 days."
        ),
        PlayPlan(
            id = "sub_weekly_creator",
            title = "Creator Weekly",
            price = "₹199",
            priceValue = 199,
            period = "7 Days Recurring",
            credits = 230,
            creditSubtitle = "230 credits per paid cycle, valid for 7 days",
            badge = "WEEKLY",
            disclosureText = "₹199 every 7 days. 230 credits per paid cycle, valid for 7 days. Auto-renews until cancelled."
        ),
        PlayPlan(
            id = "sub_monthly_creator",
            title = "Creator Monthly",
            price = "₹998",
            priceValue = 998,
            period = "30 Days Recurring",
            credits = 1200,
            creditSubtitle = "1,200 credits per paid cycle, valid for 30 days",
            badge = "BEST VALUE",
            disclosureText = "₹998 per month. 1,200 credits per paid cycle, valid for 30 days. Auto-renews until cancelled."
        )
    )

    val currentSelectedPlan = plans.find { it.id == selectedPlanId } ?: plans[0]
    val matchingProduct = productDetailsList.find { it.productId == selectedPlanId }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBackground)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "AI PRIME VIP ACCESS",
            fontSize = 22.sp,
            fontWeight = FontWeight.Black,
            color = AmberGold,
            letterSpacing = 1.sp
        )
        Text(
            text = "Unlock Ultra 4K Viral Reels & Face Swap",
            fontSize = 12.sp,
            color = TextSecondary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Feature list
        val features = listOf(
            "Ultra 4K HDR Reel Export",
            "500+ Trending Instagram Reels Templates",
            "Instant Face Swap with Zero Distortion",
            "No Watermarks on Any Video",
            "Priority GPU Processing Queue"
        )

        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CardSurface),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, CardBorder, RoundedCornerShape(16.dp))
                .padding(12.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                features.forEach { feature ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = EmeraldSuccess,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = feature,
                            fontSize = 12.sp,
                            color = TextPrimary
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Plan Selection Cards
        plans.forEach { plan ->
            val isSelected = plan.id == selectedPlanId
            val borderColor = if (isSelected) AmberPrimary else CardBorder

            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (isSelected) CardSurface else CardSurface.copy(alpha = 0.5f)
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp)
                    .border(if (isSelected) 2.dp else 1.dp, borderColor, RoundedCornerShape(16.dp))
                    .clickable { selectedPlanId = plan.id }
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = plan.title,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimary
                            )
                            if (plan.badge != null) {
                                Spacer(modifier = Modifier.width(8.dp))
                                Surface(
                                    color = AmberGold,
                                    shape = RoundedCornerShape(4.dp)
                                ) {
                                    Text(
                                        text = plan.badge,
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Color.Black,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                        }

                        Text(
                            text = plan.creditSubtitle,
                            fontSize = 12.sp,
                            color = EmeraldSuccess,
                            fontWeight = FontWeight.SemiBold
                        )

                        Text(
                            text = plan.period,
                            fontSize = 11.sp,
                            color = TextSecondary
                        )
                    }

                    Text(
                        text = plan.price,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Black,
                        color = if (isSelected) AmberGold else TextPrimary
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Prominent Google Play Billing Disclosure Box
        Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = CardSurface.copy(alpha = 0.8f)),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, CardBorder, RoundedCornerShape(12.dp))
                .padding(10.dp)
        ) {
            Text(
                text = currentSelectedPlan.disclosureText,
                fontSize = 11.sp,
                color = TextSecondary,
                textAlign = TextAlign.Center,
                lineHeight = 15.sp,
                modifier = Modifier.fillMaxWidth()
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Google Play Purchase CTA
        Button(
            onClick = {
                if (activity != null && matchingProduct != null) {
                    billingManager.launchBillingFlow(activity, matchingProduct)
                }
            },
            enabled = matchingProduct != null,
            colors = ButtonDefaults.buttonColors(
                containerColor = AmberGold,
                disabledContainerColor = CardSurface
            ),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Lock,
                    contentDescription = null,
                    tint = if (matchingProduct != null) Color.Black else TextMuted
                )
                Text(
                    text = if (matchingProduct == null) {
                        "Connecting to Google Play..."
                    } else when (selectedPlanId) {
                        "sub_double_bonanza_weekly" -> "Subscribe · ₹1 Today (then ₹499/week)"
                        "sub_weekly_creator" -> "Subscribe · ₹199/week"
                        "sub_monthly_creator" -> "Subscribe · ₹998/month"
                        else -> "Subscribe on Google Play"
                    },
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    color = if (matchingProduct != null) Color.Black else TextMuted
                )
            }
        }

        if (purchaseStatus != null) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = purchaseStatus!!,
                fontSize = 12.sp,
                color = AmberGold,
                textAlign = TextAlign.Center
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        Text(
            text = "Google Play Subscriptions auto-renew unless cancelled at least 24 hours prior to renewal in your Google Play account (Settings > Payments & Subscriptions). Unused subscription credits do not rollover.",
            fontSize = 10.sp,
            color = TextMuted,
            textAlign = TextAlign.Center,
            lineHeight = 14.sp
        )
    }
}
