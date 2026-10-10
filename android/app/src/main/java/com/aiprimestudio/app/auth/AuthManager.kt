package com.aiprimestudio.app.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.CustomCredential
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.aiprimestudio.app.data.repository.AppRepository

class AuthManager(
    private val context: Context,
    private val repository: AppRepository
) {
    private val credentialManager = CredentialManager.create(context)

    // Web Client ID from Google Cloud Console / Firebase Console
    private val serverClientId = "221269328833-s3a664qbbk8ppggmup39jb15u4fo8qjl.apps.googleusercontent.com"

    suspend fun signInWithGoogle(): Result<Unit> {
        return try {
            val googleIdOption = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(serverClientId)
                .setAutoSelectEnabled(false)
                .build()

            val request = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build()

            val result = credentialManager.getCredential(
                request = request,
                context = context
            )

            val credential = result.credential
            if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                val idToken = googleIdTokenCredential.idToken
                
                // Exchange token with backend for unified user profile & balance
                val authResult = repository.loginWithGoogle(idToken)
                if (authResult.isSuccess) {
                    Result.success(Unit)
                } else {
                    Result.failure(authResult.exceptionOrNull() ?: Exception("Backend auth error"))
                }
            } else {
                Result.failure(Exception("Unsupported credential type"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
