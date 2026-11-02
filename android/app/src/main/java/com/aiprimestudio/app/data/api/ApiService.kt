package com.aiprimestudio.app.data.api

import com.aiprimestudio.app.BuildConfig
import com.aiprimestudio.app.data.model.*
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit

interface ApiService {

    @POST("/api/auth/firebase-session")
    suspend fun authenticateFirebaseSession(
        @Body request: FirebaseSessionRequest
    ): Response<FirebaseSessionResponse>

    @GET("/api/auth/me")
    suspend fun getAuthMe(
        @Header("Authorization") bearerToken: String
    ): Response<MeResponse>

    @GET("/api/templates")
    suspend fun getTemplates(): Response<TemplatesResponse>

    @POST("/api/media/upload")
    suspend fun uploadMedia(
        @Header("Authorization") bearerToken: String,
        @Body request: UploadMediaRequest
    ): Response<UploadMediaResponse>

    @POST("/api/generations/create")
    suspend fun createGeneration(
        @Header("Authorization") bearerToken: String,
        @Body request: CreateGenerationRequest
    ): Response<CreateGenerationResponse>

    @GET("/api/generations/{id}/status")
    suspend fun getGenerationStatus(
        @Header("Authorization") bearerToken: String,
        @Path("id") id: String
    ): Response<GenerationStatusResponse>

    @DELETE("/api/auth/account")
    suspend fun deleteAccount(
        @Header("Authorization") bearerToken: String
    ): Response<DeleteAccountResponse>

    @POST("/api/reports")
    suspend fun reportContent(
        @Body request: ReportRequest
    ): Response<ReportResponse>

    @POST("/api/billing/googleplay/verify")
    suspend fun verifyGooglePlayPurchase(
        @Header("Authorization") bearerToken: String,
        @Body request: GooglePlayVerifyRequest
    ): Response<GooglePlayVerifyResponse>

    companion object {
        fun create(): ApiService {
            val logging = HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) {
                    HttpLoggingInterceptor.Level.BASIC
                } else {
                    HttpLoggingInterceptor.Level.NONE
                }
            }

            val client = OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .writeTimeout(60, TimeUnit.SECONDS)
                .addInterceptor(logging)
                .build()

            val rawServerUrl = BuildConfig.SERVER_URL
            val baseUrl = if (rawServerUrl.endsWith("/")) rawServerUrl else "$rawServerUrl/"

            return Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(ApiService::class.java)
        }
    }
}
