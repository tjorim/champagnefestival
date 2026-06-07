package be.champagnefestival.android.core.network

import be.champagnefestival.android.BuildConfig
import okhttp3.CertificatePinner

object CertificatePinnerProvider {
    private const val API_HOST = "champagnefestival.tjor.im"

    // Leaf certificate observed in Certificate Transparency for the production API, expiring July 11, 2026.
    private const val API_LEAF_PIN = "sha256/4iYSVdRc1jul5AgK0EfE3bsgOSZWv54PqqQX04BBEoM="

    // Let's Encrypt E7 intermediate public key pin. This backup pin keeps renewals from requiring app updates
    // while still limiting trust to the issuing CA currently used by the production API.
    private const val LETS_ENCRYPT_E7_PIN = "sha256/y7xVm0TVJNahMr2sZydE2jQH8SquXV9yLF9seROHHHU="

    fun productionPinner(): CertificatePinner =
        CertificatePinner
            .Builder()
            .add(API_HOST, API_LEAF_PIN)
            .add(API_HOST, LETS_ENCRYPT_E7_PIN)
            .build()

    fun forCurrentBuild(): CertificatePinner? =
        if (BuildConfig.CERTIFICATE_PINNING_ENABLED) {
            productionPinner()
        } else {
            null
        }
}
