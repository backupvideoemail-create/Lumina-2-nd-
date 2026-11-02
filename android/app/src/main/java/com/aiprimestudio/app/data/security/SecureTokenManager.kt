package com.aiprimestudio.app.data.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Manages cryptographic operations using the hardware-backed Android KeyStore.
 * The bearer token is encrypted with AES-256-GCM before writing to storage,
 * ensuring the secret key never leaves the Android hardware security module.
 */
class SecureTokenManager {
    private val keyStoreAlias = "ai_prime_bearer_token_key"
    private val provider = "AndroidKeyStore"
    private val transformation = "AES/GCM/NoPadding"
    private val gcmIvLength = 12

    init {
        try {
            val keyStore = KeyStore.getInstance(provider).apply { load(null) }
            if (!keyStore.containsAlias(keyStoreAlias)) {
                val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, provider)
                val spec = KeyGenParameterSpec.Builder(
                    keyStoreAlias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
                keyGenerator.init(spec)
                keyGenerator.generateKey()
            }
        } catch (_: Exception) {
            // Handled gracefully in encrypt/decrypt operations
        }
    }

    private fun getSecretKey(): SecretKey? {
        return try {
            val keyStore = KeyStore.getInstance(provider).apply { load(null) }
            keyStore.getKey(keyStoreAlias, null) as? SecretKey
        } catch (_: Exception) {
            null
        }
    }

    fun encryptToken(plainToken: String): String? {
        return try {
            val secretKey = getSecretKey() ?: return null
            val cipher = Cipher.getInstance(transformation)
            cipher.init(Cipher.ENCRYPT_MODE, secretKey)
            val iv = cipher.iv ?: return null
            val encryptedBytes = cipher.doFinal(plainToken.toByteArray(Charsets.UTF_8))

            val combined = ByteArray(iv.size + encryptedBytes.size)
            System.arraycopy(iv, 0, combined, 0, iv.size)
            System.arraycopy(encryptedBytes, 0, combined, iv.size, encryptedBytes.size)
            Base64.encodeToString(combined, Base64.NO_WRAP)
        } catch (_: Exception) {
            null
        }
    }

    fun decryptToken(encryptedBase64: String): String? {
        return try {
            val secretKey = getSecretKey() ?: return null
            val combined = Base64.decode(encryptedBase64, Base64.NO_WRAP)
            if (combined.size <= gcmIvLength) return null

            val iv = ByteArray(gcmIvLength)
            System.arraycopy(combined, 0, iv, 0, gcmIvLength)
            val encryptedBytes = ByteArray(combined.size - gcmIvLength)
            System.arraycopy(combined, gcmIvLength, encryptedBytes, 0, encryptedBytes.size)

            val cipher = Cipher.getInstance(transformation)
            val spec = GCMParameterSpec(128, iv)
            cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)
            val decryptedBytes = cipher.doFinal(encryptedBytes)
            String(decryptedBytes, Charsets.UTF_8)
        } catch (_: Exception) {
            null
        }
    }
}
