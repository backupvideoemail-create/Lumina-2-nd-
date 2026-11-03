package com.aiprimestudio.app.data.api

import com.aiprimestudio.app.BuildConfig
import com.aiprimestudio.app.data.model.*
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response as OkResponse
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(
    val httpCode: Int,
    override val message: String,
    val isHtmlResponse: Boolean = false,
    val isRedirect: Boolean = false
) : IOException(message)

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

    @GET("/api/generations")
    suspend fun getGenerations(
        @Header("Authorization") bearerToken: String
    ): Response<GenerationsListResponse>

    @POST("/api/reports")
    suspend fun reportContent(
        @Header("Authorization") bearerToken: String,
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

            // Interceptor to prevent HTML pages, 3xx redirects, or proxy auth screens from reaching Gson
            val responseValidationInterceptor = Interceptor { chain ->
                val request = chain.request()
                val response: OkResponse = chain.proceed(request)

                val code = response.code
                val contentType = response.header("Content-Type")?.lowercase() ?: ""
                val isHtmlContentType = contentType.contains("text/html") || contentType.contains("application/xhtml")

                // 1. Detect 3xx redirects (API endpoints must never redirect to HTML login or proxy pages)
                if (code in 300..399) {
                    val location = response.header("Location") ?: "unknown"
                    throw ApiException(
                        httpCode = code,
                        message = "HTTP $code Redirect: Backend redirected API request to '$location'. Direct JSON response expected.",
                        isRedirect = true
                    )
                }

                // 2. Detect Content-Type: text/html
                if (isHtmlContentType) {
                    throw ApiException(
                        httpCode = code,
                        message = "HTTP $code: Backend returned HTML document instead of JSON. Check server URL and network authorization.",
                        isHtmlResponse = true
                    )
                }

                // 3. Inspect body prefix for HTML document tags (<!DOCTYPE or <html)
                try {
                    val peek = response.peekBody(1024).string().trimStart()
                    if (peek.startsWith("<!doctype", ignoreCase = true) || peek.startsWith("<html", ignoreCase = true)) {
                        throw ApiException(
                            httpCode = code,
                            message = "HTTP $code: Backend returned HTML document instead of JSON data.",
                            isHtmlResponse = true
                        )
                    }
                } catch (e: Exception) {
                    if (e is ApiException) throw e
                    // peek inspection non-fatal for binary streams
                }

                response
            }

            val client = OkHttpClient.Builder()
                .followRedirects(false)
                .followSslRedirects(false)
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .writeTimeout(60, TimeUnit.SECONDS)
                .addInterceptor(responseValidationInterceptor)
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
