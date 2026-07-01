package be.champagnefestival.android.core.network

import be.champagnefestival.android.BuildConfig
import okhttp3.CertificatePinner

object CertificatePinnerProvider {
    fun forCurrentBuild(): CertificatePinner =
        fromConfig(
            enabled = BuildConfig.CERTIFICATE_PINNING_ENABLED,
            host = BuildConfig.CERTIFICATE_PIN_HOST,
            pins = BuildConfig.CERTIFICATE_PINS.toCsvList(),
        )

    fun fromConfig(
        enabled: Boolean,
        host: String,
        pins: List<String>,
    ): CertificatePinner {
        if (!enabled || host.isEmpty() || pins.isEmpty()) return CertificatePinner.DEFAULT

        return CertificatePinner
            .Builder()
            .apply {
                pins.forEach { pin -> add(host, pin) }
            }.build()
    }

    private fun String.toCsvList(): List<String> =
        split(",")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
}
