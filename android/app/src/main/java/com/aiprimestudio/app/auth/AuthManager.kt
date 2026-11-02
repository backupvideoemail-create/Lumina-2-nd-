package com.aiprimestudio.app.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.CustomCredential
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.aiprimestudio.app.data.model.UserProfile
import com.aiprimestudio.app.data.repository.AppRepository
import kotlinx.coroutines.tasks.await

class AuthManager(
    private val context: Context,
    private val repository: AppRepository
) {
    private val credentialManager = CredentialManager.create(context)
    private val firebaseAuth = FirebaseAuth.getInstance()

    // Web Client ID from Google Cloud Console / Firebase Console
    private val serverClientId = "221269328833-s3a664qbbk8ppggmup39jb15u4fo8qjl.apps.googleusercontent.com"

    /**
     * Authenticates the user using Android Credential Manager, exchanges the Google OAuth ID Token
     * for a genuine Firebase ID Token via FirebaseAuth SDK, and synchronizes the session with the backend.
     */
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
                val googleIdToken = googleIdTokenCredential.idToken

                // 1. Convert Google OAuth ID Token into a Firebase Auth Credential
                val firebaseCredential = GoogleAuthProvider.getCredential(googleIdToken, null)

                // 2. Sign in to Firebase on the Android client
                val authResult = firebaseAuth.signInWithCredential(firebaseCredential).await()
                val firebaseUser = authResult.user
                    ?: return Result.failure(Exception("Firebase authentication returned empty user"))

                // 3. Acquire the cryptographically signed Firebase ID Token (JWT)
                val tokenResult = firebaseUser.getIdToken(true).await()
                val firebaseIdToken = tokenResult.token
                    ?: return Result.failure(Exception("Failed to acquire valid Firebase ID Token"))

                // 4. Send Firebase ID Token to backend POST /api/auth/firebase-session
                val sessionResult = repository.loginWithFirebaseSession(
                    firebaseIdToken = firebaseIdToken,
                    name = firebaseUser.displayName,
                    avatar = firebaseUser.photoUrl?.toString()
                )

                if (sessionResult.isSuccess) {
                    Result.success(Unit)
                } else {
                    Result.failure(sessionResult.exceptionOrNull() ?: Exception("Backend session creation failed"))
                }
            } else {
                Result.failure(Exception("Unsupported credential type: ${credential.javaClass.simpleName}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Seamlessly restores an existing backend session after app relaunch or restart.
     * Checks if FirebaseAuth has an active user, refreshes the cryptographically signed
     * Firebase ID Token, and synchronizes the session with the backend.
     */
    suspend fun restoreSession(): Result<UserProfile> {
        return try {
            val currentUser = firebaseAuth.currentUser
                ?: return Result.failure(Exception("No active Firebase session"))

            // 1. Acquire valid Firebase ID Token (JWT)
            val tokenResult = currentUser.getIdToken(false).await()
            val firebaseIdToken = tokenResult.token
                ?: return Result.failure(Exception("Failed to acquire valid Firebase ID Token"))

            // 2. Synchronize and restore session with backend
            val sessionResult = repository.loginWithFirebaseSession(
                firebaseIdToken = firebaseIdToken,
                name = currentUser.displayName,
                avatar = currentUser.photoUrl?.toString()
            )
            sessionResult
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun signOut() {
        try {
            firebaseAuth.signOut()
        } catch (_: Exception) {
        }
        repository.logout()
    }
}
