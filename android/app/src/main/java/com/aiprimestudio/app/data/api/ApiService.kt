package com.aiprimestudio.app.data.api

import com.aiprimestudio.app.data.model.*
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit

interface ApiService {

    @POST("/api/auth/google")
    suspend fun authenticateWithGoogle(
        @Body request: GoogleAuthRequest
    ): Response<AuthResponse>

    @GET("/api/user/profile")
    suspend fun getProfile(
        @Header("Authorization") bearerToken: String
    ): Response<UserProfile>

    @GET("/api/templates")
    suspend fun getTemplates(): Response<List<TemplateItem>>

    @POST("/api/billing/googleplay/verify")
    suspend fun verifyGooglePlayPurchase(
        @Header("Authorization") bearerToken: String,
        @Body request: GooglePlayVerifyRequest
    ): Response<GooglePlayVerifyResponse>

    companion object {
        // Base URL targeting production / dev backend
        private const val BASE_URL = "https://ais-dev-falbvqcbalccpvwe3g24he-788336175738.asia-east1.run.app"

        fun create(): ApiService {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }

            val client = OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .addInterceptor(logging)
                .build()

            return Retrofit.Builder()
                .baseUrl(BASE_URL)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(ApiService::class.java)
        }
    }
}
