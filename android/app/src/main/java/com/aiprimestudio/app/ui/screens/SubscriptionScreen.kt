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
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
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
    val badge: String?,
    val isPopular: Boolean = false
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

    var selectedPlanId by remember { mutableStateOf("plan_intro_daily") }

    val plans = listOf(
        PlayPlan(
            id = "plan_intro_daily",
            title = "Double Bonanza",
            price = "₹1",
            priceValue = 1,
            period = "24 Hours Intro",
            credits = 50,
            badge = "TRAIL OFFER",
            isPopular = true
        ),
        PlayPlan(
            id = "sub_weekly_creator",
            title = "Creator Weekly",
            price = "₹199",
            priceValue = 199,
            period = "7 Days Recurring",
            credits = 300,
            badge = null
        ),
        PlayPlan(
            id = "sub_monthly_creator",
            title = "Creator Monthly",
            price = "₹998",
            priceValue = 998,
            period = "30 Days Recurring",
            credits = 1800,
            badge = "SAVE 40%"
        )
    )

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
                    Column {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = plan.title,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimary
                            )
                            if (plan.badge != null) {
                                Text(
                                    text = plan.badge,
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Black,
                                    color = Color.Black,
                                    modifier = Modifier
                                        .background(AmberGold, RoundedCornerShape(4.dp))
                                        .padding(horizontal = 4.dp, vertical = 1.dp)
                                )
                            }
                        }
                        Text(
                            text = "${plan.credits} AI Generation Credits • ${plan.period}",
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

        Spacer(modifier = Modifier.height(24.dp))

        // Google Play Purchase CTA
        Button(
            onClick = {
                val matchingProduct = productDetailsList.find { it.productId == selectedPlanId }
                if (activity != null && matchingProduct != null) {
                    billingManager.launchBillingFlow(activity, matchingProduct)
                } else {
                    // Fallback or demo simulation if Google Play account / catalog is still syncing
                }
            },
            colors = ButtonDefaults.buttonColors(containerColor = AmberGold),
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
                    tint = Color.Black
                )
                Text(
                    text = if (selectedPlanId == "plan_intro_daily") "Subscribe on Google Play (₹1)" else "Subscribe on Google Play",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.Black
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

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Google Play Subscriptions auto-renew unless cancelled at least 24 hours prior to the cycle end in your Google Play Subscriptions center. Unified credits sync instantly with your website account.",
            fontSize = 10.sp,
            color = TextMuted,
            textAlign = TextAlign.Center,
            lineHeight = 14.sp
        )
    }
}
