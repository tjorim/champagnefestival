import be.champagnefestival.buildlogic.CertPinning
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.detekt)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt.android)
}

fun quoted(value: String) = "\"$value\""

val localProperties =
    Properties().also { props ->
        val localPropertiesFile = rootProject.file("local.properties")
        if (localPropertiesFile.exists()) {
            localPropertiesFile.inputStream().use { props.load(it) }
        }
    }

val requestedTaskNames = gradle.startParameter.taskNames.map { it.substringAfterLast(":").lowercase() }

// Signing/URL credentials only matter for tasks that produce a build artifact for
// that variant. Lint and unit tests compile and analyze the release variant but
// never sign or ship anything, so lintRelease/testReleaseUnitTest must not require
// production config to be set.
fun isReleaseArtifactRequested(): Boolean {
    if (requestedTaskNames.isEmpty()) return false
    val nonArtifactKeywords = listOf("test", "lint", "detekt", "ktlint")
    return requestedTaskNames.any { taskName ->
        (taskName.contains("release") && nonArtifactKeywords.none { taskName.contains(it) }) ||
            taskName in listOf("assemble", "build", "bundle")
    }
}

// Resolves a config value from local.properties, a Gradle property, or an
// environment variable, treating blank values as unset (e.g. an empty workflow
// input). When `required` is true and the variant that needs it is actually
// being built, a missing value fails the build instead of silently falling
// back to `defaultValue`.
fun resolveConfigValue(key: String, envKey: String, required: Boolean, defaultValue: String = ""): String {
    // A blank value counts as missing so a placeholder line in local.properties
    // still falls through to the next source or the default.
    val explicitValue =
        sequenceOf(
            localProperties.getProperty(key),
            providers.gradleProperty(key).orNull,
            providers.environmentVariable(envKey).orNull
        ).firstOrNull { !it.isNullOrBlank() }
    if (required && explicitValue.isNullOrBlank()) {
        error(
            "Missing required build property '$key'. " +
                "Set it in local.properties, as a Gradle property, or as the env var '$envKey'."
        )
    }
    return explicitValue ?: defaultValue
}

val releaseApiBaseUrl =
    resolveConfigValue(
        "ANDROID_API_BASE_URL",
        "ANDROID_API_BASE_URL",
        required = isReleaseArtifactRequested(),
        defaultValue = "https://release.placeholder.invalid/"
    )

// Optional override for debug builds. Defaults to the emulator's host-loopback alias, which
// only resolves for contributors running the backend locally (see android/README.md).
val debugApiBaseUrl =
    resolveConfigValue(
        "ANDROID_DEBUG_API_BASE_URL",
        "ANDROID_DEBUG_API_BASE_URL",
        required = false,
        defaultValue = "http://10.0.2.2:8000/"
    )

val releaseCertificatePinHost =
    resolveConfigValue(
        "ANDROID_CERTIFICATE_PIN_HOST",
        "ANDROID_CERTIFICATE_PIN_HOST",
        required = isReleaseArtifactRequested(),
        defaultValue = "champagnefestival.tjor.im"
    )
val releaseCertificatePinsRaw =
    resolveConfigValue(
        "ANDROID_CERTIFICATE_PINS",
        "ANDROID_CERTIFICATE_PINS",
        required = isReleaseArtifactRequested(),
        defaultValue = ""
    )

// Pin-format and host-requires-pins validation live in buildSrc's CertPinning
// so they have unit tests (script-local functions in a Kotlin DSL build script
// cannot be tested directly). Only enforced for actual release artifact
// requests, matching the release API URL requirement above.
val releaseCertificatePins = CertPinning.resolvePins(releaseCertificatePinsRaw)
if (isReleaseArtifactRequested()) {
    CertPinning.requireValidPinFormats(releaseCertificatePins)
    CertPinning.requireHostConfiguredForPins(releaseCertificatePinHost, releaseCertificatePins)
}

// Single source of truth for the app version: the repo-root VERSION file
// (CalVer YYYY.MM.MICRO), shared with the backend and frontend instead of a
// hand-maintained literal here. Read via providers.fileContents (not
// File.readText()) so the file is tracked as a build configuration input and
// this stays Configuration Cache-compatible.
val appVersion =
    providers
        .fileContents(layout.projectDirectory.file("../../VERSION"))
        .asText
        .map { it.trim() }
        .get()

fun versionCodeFor(version: String): Int {
    // CalVer YYYY.MM.MICRO: year/month/monthly-counter map onto the same
    // MAJOR.MINOR.PATCH slots the versionCode formula below was built for.
    val parts = version.substringBefore("-").substringBefore("+").split(".")
    check(parts.size == 3) { "Expected a YYYY.MM.MICRO version, got \"$version\"" }
    val (major, minor, patch) =
        parts.map {
            it.toIntOrNull() ?: error("Invalid integer component \"$it\" in version \"$version\"")
        }
    // minor/patch must each fit in 3 digits or they'd overflow into the next digit
    // group and collide with a different version's computed code.
    check(major >= 0) { "Year must be non-negative, got $major" }
    check(minor in 0..999) { "Month must be between 0 and 999 to avoid versionCode collision, got $minor" }
    check(patch in 0..999) { "Monthly counter must be between 0 and 999 to avoid versionCode collision, got $patch" }
    val versionCode = major * 1_000_000 + minor * 1_000 + patch
    check(versionCode <= 2_100_000_000) {
        // With major = calendar year, this caps the scheme at year 2099.
        "versionCode $versionCode exceeds Google Play maximum of 2100000000"
    }
    return versionCode
}

// Falls back to "unknown" rather than failing the build when git is unavailable
// (e.g. building from a downloaded source archive with no .git directory).
val gitCommit =
    try {
        providers
            .exec {
                commandLine("git", "rev-parse", "--short", "HEAD")
                isIgnoreExitValue = true
            }.standardOutput
            .asText
            .get()
            .trim()
            .ifEmpty { "unknown" }
    } catch (e: Exception) {
        "unknown"
    }

android {
    namespace = "be.champagnefestival.android"
    compileSdk = 37

    val keystorePath =
        localProperties.getProperty("keystorePath") ?: providers.environmentVariable("KEYSTORE_PATH").orNull
    val keystorePassword =
        localProperties.getProperty("keystorePassword")
            ?: providers.environmentVariable("STORE_PASSWORD").orNull
    val keystoreKeyAlias = localProperties.getProperty("keyAlias") ?: providers.environmentVariable("KEY_ALIAS").orNull
    val keystoreKeyPassword =
        localProperties.getProperty("keyPassword") ?: providers.environmentVariable("KEY_PASSWORD").orNull
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
        applicationId = "im.tjor.champagnefestival"
        minSdk = 30
        targetSdk = 37
        // versionCode = MAJOR * 1000000 + MINOR * 1000 + PATCH (e.g. v1.2.3 → 1002003)
        versionCode = versionCodeFor(appVersion)
        versionName = appVersion
        buildConfigField("String", "BUILD_COMMIT", quoted(gitCommit))
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
            buildConfigField("String", "API_BASE_URL", quoted(debugApiBaseUrl))
            buildConfigField("String", "OIDC_CLIENT_ID", "\"champagnefestival\"")
            buildConfigField("Boolean", "CERTIFICATE_PINNING_ENABLED", "false")
            buildConfigField("String", "CERTIFICATE_PIN_HOST", quoted(""))
            buildConfigField("String", "CERTIFICATE_PINS", quoted(""))
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
            buildConfigField("String", "OIDC_CLIENT_ID", "\"champagnefestival\"")
            buildConfigField("Boolean", "CERTIFICATE_PINNING_ENABLED", "true")
            buildConfigField("String", "CERTIFICATE_PIN_HOST", quoted(releaseCertificatePinHost))
            buildConfigField("String", "CERTIFICATE_PINS", quoted(releaseCertificatePins.joinToString(",")))
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
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.fragment.ktx)
    implementation(libs.androidx.biometric)
    implementation(libs.androidx.security.crypto)
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
    implementation(libs.hilt.android)
    ksp(libs.hilt.android.compiler)

    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.json)
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
