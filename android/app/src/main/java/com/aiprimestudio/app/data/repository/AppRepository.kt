package com.aiprimestudio.app.data.repository

import android.content.Context
import com.aiprimestudio.app.data.api.ApiException
import com.aiprimestudio.app.data.api.ApiService
import com.aiprimestudio.app.data.model.*
import com.aiprimestudio.app.data.security.SecureTokenManager
import com.google.gson.Gson
import com.google.gson.JsonParser
import com.google.gson.JsonSyntaxException
import com.google.gson.stream.MalformedJsonException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import retrofit2.Response
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class AppRepository(
    context: Context? = null,
    private val apiService: ApiService = ApiService.create()
) {
    private val prefs = context?.getSharedPreferences("ai_prime_auth_session", Context.MODE_PRIVATE)
    private val secureTokenManager = SecureTokenManager()
    private val gson = Gson()

    private val _currentUser = MutableStateFlow<UserProfile?>(null)
    val currentUser: StateFlow<UserProfile?> = _currentUser.asStateFlow()

    private val _currentWallet = MutableStateFlow<Wallet?>(null)
    val currentWallet: StateFlow<Wallet?> = _currentWallet.asStateFlow()

    private val _currentSubscription = MutableStateFlow<UserSubscription?>(null)
    val currentSubscription: StateFlow<UserSubscription?> = _currentSubscription.asStateFlow()

    private val _token = MutableStateFlow<String?>(null)
    val token: StateFlow<String?> = _token.asStateFlow()

    init {
        // Restore cached session on startup for instant, flicker-free app relaunch
        prefs?.getString("encrypted_auth_token", null)?.let { encToken ->
            val decrypted = secureTokenManager.decryptToken(encToken)
            if (decrypted != null) {
                _token.value = decrypted
            }
        }
        prefs?.getString("user_profile_json", null)?.let { userJson ->
            try {
                _currentUser.value = gson.fromJson(userJson, UserProfile::class.java)
            } catch (_: Exception) {}
        }
        prefs?.getString("wallet_json", null)?.let { walletJson ->
            try {
                _currentWallet.value = gson.fromJson(walletJson, Wallet::class.java)
            } catch (_: Exception) {}
        }
        prefs?.getString("subscription_json", null)?.let { subJson ->
            try {
                _currentSubscription.value = gson.fromJson(subJson, UserSubscription::class.java)
            } catch (_: Exception) {}
        }
    }

    /**
     * Formats network and parsing exceptions into safe, user-friendly explanations.
     * Prevents raw stack traces or leaked internal tokens.
     */
    private fun formatSafeException(e: Throwable): String {
        return when (e) {
            is UnknownHostException -> "Network error: Unable to resolve server address. Check your internet connection or backend URL."
            is ConnectException -> "Network error: Failed to connect to server. Server may be offline or unreachable."
            is SocketTimeoutException -> "Network error: Server request timed out. Please try again."
            is MalformedJsonException, is JsonSyntaxException ->
                "Data error: Server returned unexpected or invalid data format instead of valid JSON."
            is ApiException -> e.message ?: "HTTP ${e.httpCode} error"
            else -> e.message?.takeIf { it.isNotBlank() } ?: "An unexpected error occurred"
        }
    }

    /**
     * Safely extracts the error message from a non-2xx HTTP response body without crashing or leaking secrets.
     */
    private fun extractErrorMessage(response: Response<*>): String {
        val code = response.code()
        val rawMsg = response.message()
        val errBody = try {
            response.errorBody()?.string()
        } catch (_: Exception) {
            null
        }

        if (!errBody.isNullOrBlank()) {
            try {
                val json = JsonParser.parseString(errBody).asJsonObject
                val err = json.get("error")?.asString ?: json.get("message")?.asString
                if (!err.isNullOrBlank()) {
                    return "HTTP $code: $err"
                }
            } catch (_: Exception) {
                if (errBody.contains("<html", ignoreCase = true) || errBody.contains("<!doctype", ignoreCase = true)) {
                    return "HTTP $code: Backend returned an HTML error page."
                }
            }
        }

        val safeText = when (code) {
            400 -> "Bad Request"
            401 -> "Authentication required"
            403 -> "Access forbidden"
            404 -> "Endpoint not found"
            429 -> "Rate limit exceeded. Please wait a moment."
            500 -> "Internal server error"
            502 -> "Bad Gateway (Server unreachable)"
            503 -> "Service temporarily unavailable"
            else -> rawMsg.ifBlank { "Request failed" }
        }
        return "HTTP $code: $safeText"
    }

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
                    val user = body.user
                    if (user == null || user.id.isBlank()) {
                        return Result.failure(Exception("Authentication succeeded but backend returned no valid user profile"))
                    }

                    _token.value = body.token
                    _currentUser.value = user
                    _currentWallet.value = body.wallet
                    _currentSubscription.value = body.subscription

                    // Encrypt bearer token with Android Keystore hardware key before persisting
                    val encryptedToken = secureTokenManager.encryptToken(body.token)
                    prefs?.edit()?.apply {
                        if (encryptedToken != null) {
                            putString("encrypted_auth_token", encryptedToken)
                        }
                        remove("auth_token") // Purge any legacy unencrypted token key
                        putString("user_profile_json", gson.toJson(user))
                        putString("wallet_json", gson.toJson(body.wallet))
                        putString("subscription_json", gson.toJson(body.subscription))
                        apply()
                    }

                    Result.success(user)
                } else {
                    Result.failure(Exception(body.error ?: body.message ?: "Firebase authentication failed on backend"))
                }
            } else if (response.isSuccessful && response.body() == null) {
                Result.failure(Exception("HTTP ${response.code()}: Empty authentication response from backend"))
            } else {
                Result.failure(Exception(extractErrorMessage(response)))
            }
        } catch (e: Exception) {
            Result.failure(Exception(formatSafeException(e)))
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
            } else if (response.isSuccessful && response.body() == null) {
                Result.failure(Exception("HTTP ${response.code()}: Empty profile response from server"))
            } else {
                Result.failure(Exception(extractErrorMessage(response)))
            }
        } catch (e: Exception) {
            Result.failure(Exception(formatSafeException(e)))
        }
    }

    suspend fun fetchTemplates(): Result<List<TemplateItem>> {
        return try {
            val response = apiService.getTemplates()
            if (response.isSuccessful && response.body() != null) {
                val templatesList = response.body()!!.templates
                Result.success(templatesList)
            } else if (response.isSuccessful && response.body() == null) {
                Result.failure(Exception("HTTP ${response.code()}: Server returned an empty template catalog"))
            } else {
                Result.failure(Exception(extractErrorMessage(response)))
            }
        } catch (e: Exception) {
            Result.failure(Exception(formatSafeException(e)))
        }
    }

    suspend fun uploadMedia(mediaBase64: String, filename: String = "upload.jpg"): Result<UploadMediaResponse> {
        val currentToken = _token.value ?: return Result.failure(Exception("Sign in required to upload media"))
        return try {
            val req = UploadMediaRequest(mediaBase64 = mediaBase64, filename = filename)
            val response = apiService.uploadMedia("Bearer $currentToken", req)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && (body.url != null || body.fileId != null)) {
                    Result.success(body)
                } else {
                    Result.failure(Exception(body.error ?: "Media upload rejected by server"))
                }
            } else if (response.isSuccessful && response.body() == null) {
                Result.failure(Exception("HTTP ${response.code()}: Empty response from upload endpoint"))
            } else {
                Result.failure(Exception(extractErrorMessage(response)))
            }
        } catch (e: Exception) {
            Result.failure(Exception(formatSafeException(e)))
        }
    }

    suspend fun createGeneration(
        templateId: String,
        inputMediaUrl: String,
        customPrompt: String? = null
    ): Result<CreateGenerationResponse> {
        val currentToken = _token.value ?: return Result.failure(Exception("Sign in required to create generation"))
        return try {
            val req = CreateGenerationRequest(
                templateId = templateId,
                inputMediaUrl = inputMediaUrl,
                customPrompt = customPrompt
            )
            val response = apiService.createGeneration("Bearer $currentToken", req)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.generation != null) {
                    refreshProfile()
                    Result.success(body)
                } else {
                    Result.failure(Exception(body.error ?: "Generation job rejected by server"))
                }
            } else if (response.isSuccessful && response.body() == null) {
                Result.failure(Exception("HTTP ${response.code()}: Empty generation response from server"))
            } else {
                Result.failure(Exception(extractErrorMessage(response)))
            }
        } catch (e: Exception) {
            Result.failure(Exception(formatSafeException(e)))
        }
    }

    suspend fun getGenerationStatus(generationId: String): Result<GenerationStatusResponse> {
        val currentToken = _token.value ?: return Result.failure(Exception("Sign in required"))
        return try {
            val response = apiService.getGenerationStatus("Bearer $currentToken", generationId)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else if (response.isSuccessful && response.body() == null) {
                Result.failure(Exception("HTTP ${response.code()}: Empty status response from server"))
            } else {
                Result.failure(Exception(extractErrorMessage(response)))
            }
        } catch (e: Exception) {
            Result.failure(Exception(formatSafeException(e)))
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
                Result.failure(Exception(extractErrorMessage(response)))
            }
        } catch (e: Exception) {
            Result.failure(Exception(formatSafeException(e)))
        }
    }

    suspend fun reportContent(
        generationId: String? = null,
        templateId: String? = null,
        reason: String,
        details: String? = null
    ): Result<String> {
        val currentToken = _token.value ?: return Result.failure(Exception("Sign in required to submit safety report"))
        return try {
            val req = ReportRequest(
                generationId = generationId,
                templateId = templateId,
                reason = reason,
                details = details
            )
            val response = apiService.reportContent("Bearer $currentToken", req)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success) {
                    Result.success(body.reportId ?: "Report received")
                } else {
                    Result.failure(Exception(body.error ?: body.message ?: "Report could not be processed"))
                }
            } else if (response.isSuccessful && response.body() == null) {
                Result.failure(Exception("HTTP ${response.code()}: Empty response from report endpoint"))
            } else {
                Result.failure(Exception(extractErrorMessage(response)))
            }
        } catch (e: Exception) {
            Result.failure(Exception(formatSafeException(e)))
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
            } else if (response.isSuccessful && response.body() == null) {
                Result.failure(Exception("HTTP ${response.code()}: Empty verification response from server"))
            } else {
                Result.failure(Exception(extractErrorMessage(response)))
            }
        } catch (e: Exception) {
            Result.failure(Exception(formatSafeException(e)))
        }
    }

    suspend fun fetchMyCreations(): Result<List<GenerationItem>> {
        val currentToken = _token.value ?: return Result.failure(Exception("Sign in required to view creations"))
        return try {
            val response = apiService.getGenerations("Bearer $currentToken")
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.generations)
            } else if (response.isSuccessful && response.body() == null) {
                Result.failure(Exception("HTTP ${response.code()}: Empty creations response from server"))
            } else {
                Result.failure(Exception(extractErrorMessage(response)))
            }
        } catch (e: Exception) {
            Result.failure(Exception(formatSafeException(e)))
        }
    }

    fun logout() {
        _token.value = null
        _currentUser.value = null
        _currentWallet.value = null
        _currentSubscription.value = null
        prefs?.edit()?.clear()?.apply()
    }
}
