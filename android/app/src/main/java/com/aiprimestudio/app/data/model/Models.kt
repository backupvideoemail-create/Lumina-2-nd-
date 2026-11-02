package com.aiprimestudio.app.data.model

import com.aiprimestudio.app.BuildConfig
import com.google.gson.annotations.SerializedName

data class UserProfile(
    @SerializedName("id") val id: String,
    @SerializedName("email") val email: String?,
    @SerializedName("name") val name: String?,
    @SerializedName("avatar") val avatar: String? = null,
    @SerializedName("picture") val picture: String? = null,
    @SerializedName("role") val role: String? = null,
    @SerializedName("credits") val credits: Int = 0,
    @SerializedName("subscriptionStatus") val subscriptionStatus: String? = null
) {
    val displayAvatar: String?
        get() = avatar?.takeIf { it.isNotBlank() } ?: picture
}

data class Wallet(
    @SerializedName("userId") val userId: String = "",
    @SerializedName("balance") val balance: Int = 0,
    @SerializedName("credits") val legacyCredits: Int = 0,
    @SerializedName("lifetimeCredits") val lifetimeCredits: Int = 0,
    @SerializedName("spentCredits") val spentCredits: Int = 0
) {
    val effectiveBalance: Int
        get() = if (balance > 0) balance else legacyCredits
}

data class UserSubscription(
    @SerializedName("id") val id: String = "",
    @SerializedName("userId") val userId: String = "",
    @SerializedName("planId") val planId: String = "",
    @SerializedName("planName") val planName: String = "",
    @SerializedName("status") val status: String = "inactive",
    @SerializedName("renewsAt") val renewsAt: String? = null,
    @SerializedName("nextChargeAt") val nextChargeAt: String? = null
)

data class TemplateItem(
    @SerializedName("id") val id: String,
    @SerializedName("title") val title: String,
    @SerializedName("category") val category: String = "Trending",
    @SerializedName("cover") val cover: String? = null,
    @SerializedName("coverImage") val legacyCoverImage: String? = null,
    @SerializedName("thumbnail") val thumbnail: String? = null,
    @SerializedName("sampleResult") val sampleResult: String? = null,
    @SerializedName("sampleAfter") val sampleAfter: String? = null,
    @SerializedName("sampleBefore") val sampleBefore: String? = null,
    @SerializedName("preview") val preview: String? = null,
    @SerializedName("previewVideo") val previewVideo: String? = null,
    @SerializedName("demoVideo") val demoVideo: String? = null,
    @SerializedName("creditCost") val creditCost: Int? = null,
    @SerializedName("costCredits") val costCredits: Int? = null,
    @SerializedName("creditsCost") val creditsCost: Int? = null,
    @SerializedName("badge") val badge: String? = null,
    @SerializedName("type") val type: String? = null
) {
    val displayImage: String
        get() {
            val raw = cover?.takeIf { it.isNotBlank() }
                ?: sampleResult?.takeIf { it.isNotBlank() }
                ?: sampleAfter?.takeIf { it.isNotBlank() }
                ?: legacyCoverImage?.takeIf { it.isNotBlank() }
                ?: thumbnail?.takeIf { it.isNotBlank() }
                ?: preview?.takeIf { it.isNotBlank() }
                ?: ""
            if (raw.isBlank()) return ""
            return if (raw.startsWith("http://") || raw.startsWith("https://")) {
                raw
            } else {
                val base = BuildConfig.SERVER_URL.trimEnd('/')
                val path = if (raw.startsWith("/")) raw else "/$raw"
                "$base$path"
            }
        }

    val displayCredits: Int
        get() = creditCost ?: costCredits ?: creditsCost ?: 10
}

data class TemplatesResponse(
    @SerializedName("templates") val templates: List<TemplateItem> = emptyList()
)

data class FirebaseSessionRequest(
    @SerializedName("idToken") val idToken: String,
    @SerializedName("name") val name: String? = null,
    @SerializedName("avatar") val avatar: String? = null
)

data class FirebaseSessionResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("user") val user: UserProfile? = null,
    @SerializedName("wallet") val wallet: Wallet? = null,
    @SerializedName("token") val token: String? = null,
    @SerializedName("subscription") val subscription: UserSubscription? = null,
    @SerializedName("isNewUser") val isNewUser: Boolean = false,
    @SerializedName("message") val message: String? = null,
    @SerializedName("error") val error: String? = null
)

data class MeResponse(
    @SerializedName("user") val user: UserProfile? = null,
    @SerializedName("wallet") val wallet: Wallet? = null,
    @SerializedName("activeSubscription") val activeSubscription: UserSubscription? = null,
    @SerializedName("hasActivePlan") val hasActivePlan: Boolean = false,
    @SerializedName("canTopUp") val canTopUp: Boolean = false,
    @SerializedName("isIntroEligible") val isIntroEligible: Boolean = false
)

data class UploadMediaRequest(
    @SerializedName("mediaBase64") val mediaBase64: String,
    @SerializedName("filename") val filename: String = "upload.jpg"
)

data class UploadMediaResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("fileId") val fileId: String? = null,
    @SerializedName("url") val url: String? = null,
    @SerializedName("mimeType") val mimeType: String? = null,
    @SerializedName("sizeBytes") val sizeBytes: Long = 0,
    @SerializedName("error") val error: String? = null
)

data class CreateGenerationRequest(
    @SerializedName("templateId") val templateId: String,
    @SerializedName("inputMediaUrl") val inputMediaUrl: String,
    @SerializedName("customPrompt") val customPrompt: String? = null
)

data class CreateGenerationResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("generation") val generation: GenerationStatusDetails? = null,
    @SerializedName("remainingCredits") val remainingCredits: Int? = null,
    @SerializedName("error") val error: String? = null
) {
    val generationId: String?
        get() = generation?.id
}

data class GenerationStatusDetails(
    @SerializedName("id") val id: String,
    @SerializedName("status") val status: String,
    @SerializedName("resultMediaUrl") val resultMediaUrl: String? = null,
    @SerializedName("outputUrl") val legacyOutputUrl: String? = null,
    @SerializedName("error") val error: String? = null,
    @SerializedName("elapsedSeconds") val elapsedSeconds: Int? = null
) {
    val displayResultUrl: String?
        get() {
            val raw = resultMediaUrl?.takeIf { it.isNotBlank() }
                ?: legacyOutputUrl?.takeIf { it.isNotBlank() }
                ?: return null
            return if (raw.startsWith("http://") || raw.startsWith("https://")) {
                raw
            } else {
                val base = BuildConfig.SERVER_URL.trimEnd('/')
                val path = if (raw.startsWith("/")) raw else "/$raw"
                "$base$path"
            }
        }
}

data class GenerationStatusResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("generation") val generation: GenerationStatusDetails? = null,
    @SerializedName("status") val status: String? = null,
    @SerializedName("resultMediaUrl") val resultMediaUrl: String? = null,
    @SerializedName("error") val error: String? = null
) {
    val effectiveResultUrl: String?
        get() = generation?.displayResultUrl ?: resultMediaUrl?.let { raw ->
            if (raw.startsWith("http://") || raw.startsWith("https://")) raw
            else "${BuildConfig.SERVER_URL.trimEnd('/')}/${raw.trimStart('/')}"
        }

    val currentStatus: String
        get() = status ?: generation?.status ?: "processing"
}

data class GooglePlayVerifyRequest(
    @SerializedName("productId") val productId: String,
    @SerializedName("purchaseToken") val purchaseToken: String,
    @SerializedName("orderId") val orderId: String? = null,
    @SerializedName("packageName") val packageName: String = "com.aiprimestudio.app"
)

data class GooglePlayVerifyResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("verified") val verified: Boolean = false,
    @SerializedName("message") val message: String? = null,
    @SerializedName("wallet") val wallet: Wallet? = null,
    @SerializedName("subscription") val subscription: UserSubscription? = null,
    @SerializedName("error") val error: String? = null
)

data class DeleteAccountResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("message") val message: String? = null,
    @SerializedName("error") val error: String? = null
)

data class ReportRequest(
    @SerializedName("generationId") val generationId: String? = null,
    @SerializedName("templateId") val templateId: String? = null,
    @SerializedName("reason") val reason: String,
    @SerializedName("details") val details: String? = null
)

data class ReportResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("reportId") val reportId: String? = null,
    @SerializedName("message") val message: String? = null,
    @SerializedName("error") val error: String? = null
)

data class GenerationsListResponse(
    @SerializedName("generations") val generations: List<GenerationItem> = emptyList()
)

data class GenerationItem(
    @SerializedName("id") val id: String,
    @SerializedName("status") val status: String = "completed",
    @SerializedName("resultMediaUrl") val resultMediaUrl: String? = null,
    @SerializedName("resultVideoPreview") val resultVideoPreview: String? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
    @SerializedName("templateId") val templateId: String? = null
) {
    val effectiveResultUrl: String?
        get() {
            val raw = resultMediaUrl?.takeIf { it.isNotBlank() }
                ?: resultVideoPreview?.takeIf { it.isNotBlank() }
                ?: return null
            return if (raw.startsWith("http://") || raw.startsWith("https://")) {
                raw
            } else {
                val base = BuildConfig.SERVER_URL.trimEnd('/')
                val path = if (raw.startsWith("/")) raw else "/$raw"
                "$base$path"
            }
        }
}

