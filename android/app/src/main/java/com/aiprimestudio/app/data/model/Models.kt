package com.aiprimestudio.app.data.model

import com.google.gson.annotations.SerializedName

data class UserProfile(
    @SerializedName("id") val id: String,
    @SerializedName("email") val email: String?,
    @SerializedName("name") val name: String?,
    @SerializedName("picture") val picture: String?,
    @SerializedName("role") val role: String?,
    @SerializedName("credits") val credits: Int = 0,
    @SerializedName("subscriptionStatus") val subscriptionStatus: String? = null
)

data class Wallet(
    @SerializedName("userId") val userId: String,
    @SerializedName("credits") val credits: Int = 0,
    @SerializedName("totalEarned") val totalEarned: Int = 0,
    @SerializedName("totalSpent") val totalSpent: Int = 0
)

data class UserSubscription(
    @SerializedName("id") val id: String,
    @SerializedName("userId") val userId: String,
    @SerializedName("planId") val planId: String,
    @SerializedName("planName") val planName: String,
    @SerializedName("status") val status: String,
    @SerializedName("nextChargeAt") val nextChargeAt: String? = null
)

data class TemplateItem(
    @SerializedName("id") val id: String,
    @SerializedName("title") val title: String,
    @SerializedName("category") val category: String,
    @SerializedName("thumbnail") val thumbnail: String,
    @SerializedName("demoVideo") val demoVideo: String? = null,
    @SerializedName("creditsCost") val creditsCost: Int = 10,
    @SerializedName("badge") val badge: String? = null
)

data class GooglePlayVerifyRequest(
    @SerializedName("productId") val productId: String,
    @SerializedName("purchaseToken") val purchaseToken: String,
    @SerializedName("orderId") val orderId: String? = null,
    @SerializedName("packageName") val packageName: String = "com.aiprimestudio.app"
)

data class GooglePlayVerifyResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String?,
    @SerializedName("creditsAdded") val creditsAdded: Int = 0,
    @SerializedName("wallet") val wallet: Wallet? = null,
    @SerializedName("subscription") val subscription: UserSubscription? = null
)

data class GoogleAuthRequest(
    @SerializedName("idToken") val idToken: String
)

data class AuthResponse(
    @SerializedName("token") val token: String,
    @SerializedName("user") val user: UserProfile
)
