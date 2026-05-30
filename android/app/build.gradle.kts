plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "be.champagnefestival.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "be.champagnefestival.android"
        minSdk = 26
        targetSdk = 35
        // versionCode = MAJOR * 1000000 + MINOR * 1000 + PATCH (e.g. v1.2.3 → 1002003)
        versionCode = 1000000
        versionName = "1.0.0"

        manifestPlaceholders["appAuthRedirectScheme"] = "be.champagnefestival.android"
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:8000/\"")
            buildConfigField("String", "OIDC_ISSUER_URL", "\"http://10.0.2.2:9000/application/o/champagnefestival/\"")
            buildConfigField("String", "OIDC_CLIENT_ID", "\"champagnefestival\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "API_BASE_URL", "\"https://api.champagnefestival.tjor.im/\"")
            buildConfigField("String", "OIDC_ISSUER_URL", "\"https://auth.tjor.im/application/o/champagnefestival/\"")
            buildConfigField("String", "OIDC_CLIENT_ID", "\"champagnefestival\"")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }

    lint {
        // Crashes due to IncompatibleClassChangeError in NonNullableMutableLiveDataDetector
        // against the Kotlin Analysis API version bundled with the current Kotlin plugin.
        disable += "NullSafeMutableLiveData"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.google.android.material)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.retrofit.core)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp.core)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.appauth)
    implementation(libs.mlkit.barcode.scanning)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.kotlinx.coroutines.android)

    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
}
