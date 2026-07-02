import be.champagnefestival.buildlogic.CertPinning

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.detekt)
    alias(libs.plugins.ktlint)
}

fun quoted(value: String) = "\"$value\""

val requestedTaskNames = gradle.startParameter.taskNames.map { it.substringAfterLast(":").lowercase() }

// Signing/URL credentials only matter for tasks that produce a build artifact for
// that variant. Lint and unit tests compile and analyze the release variant but
// never sign or ship anything, so lintRelease/testReleaseUnitTest must not require
// production config to be set.
fun isReleaseArtifactRequested(): Boolean {
    if (requestedTaskNames.isEmpty()) return false
    val artifactVerbs = listOf("assemble", "bundle", "install", "package")
    return requestedTaskNames.any { taskName ->
        (taskName.contains("release") && artifactVerbs.any { verb -> taskName.contains(verb) }) ||
            taskName in listOf("assemble", "build", "bundle")
    }
}

// Resolves a config value from a Gradle property or environment variable of the
// same name, treating blank values as unset (e.g. an empty workflow input). When
// `required` is true and the variant that needs it is actually being built, a
// missing value fails the build instead of silently falling back to `defaultValue`.
fun resolveConfigValue(
    name: String,
    required: Boolean,
    defaultValue: String = "",
): String {
    val explicitValue =
        sequenceOf(
            providers.gradleProperty(name).orNull,
            providers.environmentVariable(name).orNull,
        ).firstOrNull { !it.isNullOrBlank() }
    if (required && explicitValue.isNullOrBlank()) {
        error("Missing required build property '$name'. Set it as a Gradle property or env var.")
    }
    return explicitValue ?: defaultValue
}

// No staging backend is deployed yet; unlike release, a missing staging value
// falls back to the placeholder instead of failing (staging builds are ad-hoc
// test artifacts, not something shipped to real users).
val stagingApiBaseUrl =
    resolveConfigValue(
        "CHAMPAGNEFESTIVAL_ANDROID_STAGING_API_BASE_URL",
        required = false,
        defaultValue = "https://staging.placeholder.invalid/",
    )
val stagingOidcIssuerUrl =
    resolveConfigValue(
        "CHAMPAGNEFESTIVAL_ANDROID_STAGING_OIDC_ISSUER_URL",
        required = false,
        defaultValue = "https://staging-auth.placeholder.invalid/realms/champagnefestival",
    )
val releaseApiBaseUrl =
    resolveConfigValue(
        "CHAMPAGNEFESTIVAL_ANDROID_RELEASE_API_BASE_URL",
        required = isReleaseArtifactRequested(),
        defaultValue = "https://release.placeholder.invalid/",
    )
val releaseOidcIssuerUrl =
    resolveConfigValue(
        "CHAMPAGNEFESTIVAL_ANDROID_RELEASE_OIDC_ISSUER_URL",
        required = isReleaseArtifactRequested(),
        defaultValue = "https://release-auth.placeholder.invalid/realms/champagnefestival",
    )

val prodCertificatePinHost =
    providers
        .gradleProperty("CHAMPAGNEFESTIVAL_ANDROID_PROD_CERTIFICATE_PIN_HOST")
        .orElse("champagnefestival.tjor.im")
val prodCertificatePinsRaw =
    providers
        .gradleProperty("CHAMPAGNEFESTIVAL_ANDROID_PROD_CERTIFICATE_PINS")
        .orElse(
            "sha256/y7xVm0TVJNahMr2sZydE2jQH8SquXV9yLF9seROHHHU=," +
                "sha256/C5+Q0gPI67ZTmAD/C84YyfVdbRF+O60CHGxkg1/g7xs=",
        )

// Pin-format and host-requires-pins validation live in buildSrc's CertPinning
// so they have unit tests (script-local functions in a Kotlin DSL build script
// cannot be tested directly).
val prodCertificatePins = CertPinning.resolvePins(prodCertificatePinsRaw.get())
CertPinning.requireValidPinFormats(prodCertificatePins)
CertPinning.requireHostForPins(prodCertificatePins, prodCertificatePinHost.get())

android {
    namespace = "be.champagnefestival.android"
    compileSdk = 37

    val keystorePath = providers.environmentVariable("KEYSTORE_PATH").orNull
    val keystorePassword = providers.environmentVariable("STORE_PASSWORD").orNull
    val keystoreKeyAlias = providers.environmentVariable("KEY_ALIAS").orNull
    val keystoreKeyPassword = providers.environmentVariable("KEY_PASSWORD").orNull
    signingConfigs {
        if (!keystorePath.isNullOrBlank() &&
            !keystorePassword.isNullOrBlank() &&
            !keystoreKeyAlias.isNullOrBlank() &&
            !keystoreKeyPassword.isNullOrBlank()
        ) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = keystorePassword
                keyAlias = keystoreKeyAlias
                keyPassword = keystoreKeyPassword
            }
        }
    }

    defaultConfig {
        applicationId = "be.champagnefestival.android"
        minSdk = 26
        targetSdk = 37
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
            buildConfigField("String", "OIDC_ISSUER_URL", "\"http://10.0.2.2:8080/realms/champagnefestival\"")
            buildConfigField("String", "OIDC_CLIENT_ID", "\"champagnefestival\"")
            buildConfigField("Boolean", "CERTIFICATE_PINNING_ENABLED", "false")
            buildConfigField("String", "CERTIFICATE_PIN_HOST", quoted(""))
            buildConfigField("String", "CERTIFICATE_PINS", quoted(""))
        }
        create("staging") {
            initWith(getByName("debug"))
            matchingFallbacks += listOf("debug")
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            buildConfigField("String", "API_BASE_URL", quoted(stagingApiBaseUrl))
            buildConfigField("String", "OIDC_ISSUER_URL", quoted(stagingOidcIssuerUrl))
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            val releaseSigningConfig = signingConfigs.findByName("release")
            if (releaseSigningConfig != null) {
                signingConfig = releaseSigningConfig
            }
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "API_BASE_URL", quoted(releaseApiBaseUrl))
            buildConfigField("String", "OIDC_ISSUER_URL", quoted(releaseOidcIssuerUrl))
            buildConfigField("String", "OIDC_CLIENT_ID", "\"champagnefestival\"")
            buildConfigField("Boolean", "CERTIFICATE_PINNING_ENABLED", "true")
            buildConfigField("String", "CERTIFICATE_PIN_HOST", quoted(prodCertificatePinHost.get()))
            buildConfigField("String", "CERTIFICATE_PINS", quoted(prodCertificatePins.joinToString(",")))
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }

    lint {
        // Crashes due to IncompatibleClassChangeError in NonNullableMutableLiveDataDetector
        // against the Kotlin Analysis API version bundled with the current Kotlin plugin.
        disable += "NullSafeMutableLiveData"
    }

    packaging {
        resources {
            // OkHttp 5.x and jspecify both ship this OSGI metadata file
            excludes += "META-INF/versions/9/OSGI-INF/MANIFEST.MF"
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.fragment.ktx)
    implementation(libs.androidx.biometric)
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
    testImplementation(libs.okhttp.mockwebserver)
}

detekt {
    buildUponDefaultConfig = true
    allRules = false
    config.setFrom(files("$rootDir/config/detekt/detekt.yml"))
}

ktlint {
    android = true
}

tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach {
    jvmTarget = "17"
}
