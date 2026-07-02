package be.champagnefestival.buildlogic

/**
 * Release-build certificate-pinning helpers, extracted from app/build.gradle.kts
 * so they can be unit tested (script-local functions in a Kotlin DSL build script
 * cannot be).
 */
object CertPinning {
    fun resolvePins(pins: String?): List<String> =
        pins?.split(",")?.map { it.trim() }?.filter { it.isNotBlank() } ?: emptyList()

    private val base64Regex = Regex("^[A-Za-z0-9+/_-]+={0,2}$")

    // OkHttp's CertificatePinner requires the base64-decoded hash to be
    // exactly 32 bytes for sha256 or 20 bytes for sha1; a pin that merely has
    // the right prefix but a malformed hash would otherwise fail at runtime
    // instead of at build time.
    fun requireValidPinFormats(pins: List<String>) {
        val invalidPins =
            pins.filter { pin ->
                val parts = pin.split('/', limit = 2)
                if (parts.size != 2) {
                    return@filter true
                }
                val (prefix, encoded) = parts
                if (!base64Regex.matches(encoded)) {
                    return@filter true
                }
                when (prefix) {
                    "sha256" -> encoded.length !in 43..44
                    "sha1" -> encoded.length !in 27..28
                    else -> true
                }
            }
        check(invalidPins.isEmpty()) {
            "Invalid pin format(s): $invalidPins. " +
                "Pins must start with 'sha256/' or 'sha1/' followed by a valid base64-encoded hash."
        }
    }

    fun requireHostForPins(
        pins: List<String>,
        host: String,
    ) {
        check(pins.isEmpty() || host.isNotBlank()) {
            "Certificate pins are configured but no pin host is set. " +
                "Certificate pinning would be ineffective — fix " +
                "CHAMPAGNEFESTIVAL_ANDROID_PROD_CERTIFICATE_PIN_HOST."
        }
    }
}
