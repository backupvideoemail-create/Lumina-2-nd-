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

    private val _token = MutableStateFlow<String?>(null)
    val token: StateFlow<String?> = _token.asStateFlow()

    suspend fun loginWithGoogle(idToken: String): Result<UserProfile> {
        return try {
            val response = apiService.authenticateWithGoogle(GoogleAuthRequest(idToken))
            if (response.isSuccessful && response.body() != null) {
                val authRes = response.body()!!
                _token.value = authRes.token
                _currentUser.value = authRes.user
                Result.success(authRes.user)
            } else {
                Result.failure(Exception("Google Sign-In failed: HTTP ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun refreshProfile(): Result<UserProfile> {
        val currentToken = _token.value ?: return Result.failure(Exception("Not logged in"))
        return try {
            val response = apiService.getProfile("Bearer $currentToken")
            if (response.isSuccessful && response.body() != null) {
                val profile = response.body()!!
                _currentUser.value = profile
                Result.success(profile)
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
                Result.success(response.body()!!)
            } else {
                Result.success(emptyList())
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
                // Refresh profile to update credits on UI
                refreshProfile()
                Result.success(result)
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
    }
}
