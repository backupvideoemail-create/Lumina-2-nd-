plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Automatically activate Google Services plugin if real google-services.json exists
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.aiprimestudio.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.aiprimestudio.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    signingConfigs {
        getByName("debug") {
            val debugKeystore = file("debug.keystore")
            if (debugKeystore.exists()) {
                storeFile = debugKeystore
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
        create("release") {
            val keystorePath = System.getenv("KEYSTORE_FILE") ?: "release.keystore"
            val keystoreFile = file(keystorePath)
            if (keystoreFile.exists()) {
                storeFile = keystoreFile
                storePassword = System.getenv("KEYSTORE_PASSWORD") ?: ""
                keyAlias = System.getenv("KEY_ALIAS") ?: ""
                keyPassword = System.getenv("KEY_PASSWORD") ?: ""
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )

            val prodServerUrl = (project.findProperty("PROD_SERVER_URL") as? String)
                ?: System.getenv("PROD_SERVER_URL")
                ?: ""

            val isBuildingRelease = gradle.startParameter.taskNames.any {
                it.contains("Release", ignoreCase = true) || it.contains("bundle", ignoreCase = true)
            }

            val isInvalidUrl = prodServerUrl.isBlank() ||
                prodServerUrl.contains("ais-dev", ignoreCase = true) ||
                prodServerUrl.contains("UNCONFIGURED", ignoreCase = true) ||
                prodServerUrl.contains("example.com", ignoreCase = true) ||
                !prodServerUrl.startsWith("https://")

            if (isBuildingRelease && isInvalidUrl) {
                throw GradleException(
                    "CRITICAL RELEASE ERROR: Release build requires a verified, production 'PROD_SERVER_URL'. " +
                    "Got: '$prodServerUrl'. You must supply a valid https production URL via -PPROD_SERVER_URL or PROD_SERVER_URL environment variable. " +
                    "Development/staging URLs (ais-dev) and unconfigured placeholders are strictly forbidden in production release bundles."
                )
            }

            buildConfigField("String", "SERVER_URL", "\"$prodServerUrl\"")

            // Production release signing configuration: strictly use release keystore (never sign production AAB with debug key)
            val releaseConfig = signingConfigs.findByName("release")
            if (releaseConfig?.storeFile?.exists() == true) {
                signingConfig = releaseConfig
            }
        }
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
            signingConfig = signingConfigs.getByName("debug")

            // Debug backend URL: Configurable via Gradle property (-PANDROID_DEBUG_SERVER_URL=...) or env var ANDROID_DEBUG_SERVER_URL.
            // Defaults to verified production Cloud Run URL for immediate owner QA when no separate staging endpoint is configured.
            val debugServerUrl = (project.findProperty("ANDROID_DEBUG_SERVER_URL") as? String)
                ?: System.getenv("ANDROID_DEBUG_SERVER_URL")
                ?: (project.findProperty("PROD_SERVER_URL") as? String)
                ?: System.getenv("PROD_SERVER_URL")
                ?: "https://ai-prime-studio-photo-video-221269328833.asia-southeast1.run.app"

            buildConfigField("String", "SERVER_URL", "\"$debugServerUrl\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs = freeCompilerArgs + listOf(
            "-Xskip-metadata-version-check"
        )
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // AndroidX Core & Lifecycle
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.activity:activity-compose:1.9.0")

    // Jetpack Compose BOM & UI
    val composeBom = platform("androidx.compose:compose-bom:2024.05.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3:1.2.1")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.7.7")

    // Image loading with Coil
    implementation("io.coil-kt:coil-compose:2.6.0")

    // Google Play Billing Library (v8.0.0 official stable PBL)
    implementation("com.android.billingclient:billing-ktx:8.0.0")

    // Firebase Auth BOM & SDK (For Google ID Token -> Firebase ID Token exchange)
    implementation(platform("com.google.firebase:firebase-bom:33.1.0"))
    implementation("com.google.firebase:firebase-auth-ktx")

    // Google Sign-In & Credential Manager
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    implementation("com.google.android.gms:play-services-auth:21.1.1")

    // Networking (Retrofit + OkHttp)
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Kotlin Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.0")

    // Debugging & Tooling
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
