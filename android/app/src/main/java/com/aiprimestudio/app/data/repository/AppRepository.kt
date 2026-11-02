package com.aiprimestudio.app.data.repository

import com.aiprimestudio.app.data.api.ApiService
import com.aiprimestudio.app.data.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class AppRepository(
    private val apiService: ApiService = ApiService.create()
) {
    private val _currentUser = MutableStateFlow<UserProfile?>(null)
    val currentUser: StateFlow<UserProfile?> = _currentUser.asStateFlow()

    private val _currentWallet = MutableStateFlow<Wallet?>(null)
    val currentWallet: StateFlow<Wallet?> = _currentWallet.asStateFlow()

    private val _currentSubscription = MutableStateFlow<UserSubscription?>(null)
    val currentSubscription: StateFlow<UserSubscription?> = _currentSubscription.asStateFlow()

    private val _token = MutableStateFlow<String?>(null)
    val token: StateFlow<String?> = _token.asStateFlow()

    suspend fun loginWithFirebaseSession(
        firebaseIdToken: String,
        name: String? = null,
        avatar: String? = null
    ): Result<UserProfile> {
        return try {
            val req = FirebaseSessionRequest(
                idToken = firebaseIdToken,
                name = name,
                avatar = avatar
            )
            val response = apiService.authenticateFirebaseSession(req)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.token != null) {
                    _token.value = body.token
                    _currentUser.value = body.user
                    _currentWallet.value = body.wallet
                    _currentSubscription.value = body.subscription
                    Result.success(body.user ?: UserProfile(id = "", email = null, name = name))
                } else {
                    Result.failure(Exception(body.error ?: body.message ?: "Firebase authentication failed"))
                }
            } else {
                Result.failure(Exception("Authentication failed: HTTP ${response.code()} ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun refreshProfile(): Result<MeResponse> {
        val currentToken = _token.value ?: return Result.failure(Exception("Not signed in"))
        return try {
            val response = apiService.getAuthMe("Bearer $currentToken")
            if (response.isSuccessful && response.body() != null) {
                val me = response.body()!!
                if (me.user != null) {
                    _currentUser.value = me.user
                }
                if (me.wallet != null) {
                    _currentWallet.value = me.wallet
                }
                _currentSubscription.value = me.activeSubscription
                Result.success(me)
            } else {
                Result.failure(Exception("Failed to fetch profile: HTTP ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun fetchTemplates(): Result<List<TemplateItem>> {
        return try {
            val response = apiService.getTemplates()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.templates)
            } else {
                Result.success(emptyList())
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun uploadMedia(mediaBase64: String, filename: String = "upload.jpg"): Result<UploadMediaResponse> {
        val currentToken = _token.value ?: return Result.failure(Exception("Sign in required to upload media"))
        return try {
            val req = UploadMediaRequest(mediaBase64 = mediaBase64, filename = filename)
            val response = apiService.uploadMedia("Bearer $currentToken", req)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.fileId != null) {
                    Result.success(body)
                } else {
                    Result.failure(Exception(body.error ?: "Media upload rejected by server"))
                }
            } else {
                Result.failure(Exception("Upload failed: HTTP ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createGeneration(
        templateId: String,
        mediaFileId: String,
        customerPrompt: String? = null
    ): Result<CreateGenerationResponse> {
        val currentToken = _token.value ?: return Result.failure(Exception("Sign in required to create generation"))
        return try {
            val req = CreateGenerationRequest(
                templateId = templateId,
                mediaFileId = mediaFileId,
                customerPrompt = customerPrompt
            )
            val response = apiService.createGeneration("Bearer $currentToken", req)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.generationId != null) {
                    // Refresh balance
                    refreshProfile()
                    Result.success(body)
                } else {
                    Result.failure(Exception(body.error ?: "Generation job rejected by server"))
                }
            } else {
                Result.failure(Exception("Job creation failed: HTTP ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getGenerationStatus(generationId: String): Result<GenerationStatusResponse> {
        val currentToken = _token.value ?: return Result.failure(Exception("Sign in required"))
        return try {
            val response = apiService.getGenerationStatus("Bearer $currentToken", generationId)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Status check failed: HTTP ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun deleteAccount(): Result<Unit> {
        val currentToken = _token.value ?: return Result.failure(Exception("Sign in required to delete account"))
        return try {
            val response = apiService.deleteAccount("Bearer $currentToken")
            if (response.isSuccessful) {
                logout()
                Result.success(Unit)
            } else {
                Result.failure(Exception("Account deletion failed: HTTP ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun reportContent(
        generationId: String? = null,
        templateId: String? = null,
        reason: String,
        details: String? = null
    ): Result<String> {
        return try {
            val req = ReportRequest(
                generationId = generationId,
                templateId = templateId,
                reason = reason,
                details = details
            )
            val response = apiService.reportContent(req)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.reportId ?: "Report received")
            } else {
                Result.failure(Exception("Report failed: HTTP ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun verifyGooglePlayPurchase(
        productId: String,
        purchaseToken: String,
        orderId: String? = null
    ): Result<GooglePlayVerifyResponse> {
        val currentToken = _token.value ?: return Result.failure(Exception("Login required to sync purchase"))
        return try {
            val req = GooglePlayVerifyRequest(
                productId = productId,
                purchaseToken = purchaseToken,
                orderId = orderId
            )
            val response = apiService.verifyGooglePlayPurchase("Bearer $currentToken", req)
            if (response.isSuccessful && response.body() != null) {
                val result = response.body()!!
                if (result.success && result.verified) {
                    refreshProfile()
                    Result.success(result)
                } else {
                    Result.failure(Exception(result.error ?: result.message ?: "Verification rejected"))
                }
            } else {
                Result.failure(Exception("Purchase verification failed: HTTP ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun logout() {
        _token.value = null
        _currentUser.value = null
        _currentWallet.value = null
        _currentSubscription.value = null
    }
}
