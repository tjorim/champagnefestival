package be.champagnefestival.android.core.network

import be.champagnefestival.android.BuildConfig
import okhttp3.CertificatePinner

object CertificatePinnerProvider {
    private const val API_HOST = "champagnefestival.tjor.im"

    // Let's Encrypt E7 intermediate public key pin.
    private const val LETS_ENCRYPT_E7_PIN = "sha256/y7xVm0TVJNahMr2sZydE2jQH8SquXV9yLF9seROHHHU="

    // ISRG Root X1 — backup pin so intermediate CA rotation doesn't brick the app.
    private const val ISRG_ROOT_X1_PIN = "sha256/C5+Q0gPI67ZTmAD/C84YyfVdbRF+O60CHGxkg1/g7xs="

    fun productionPinner(): CertificatePinner =
        CertificatePinner
            .Builder()
            .add(API_HOST, LETS_ENCRYPT_E7_PIN)
            .add(API_HOST, ISRG_ROOT_X1_PIN)
            .build()

    fun forCurrentBuild(): CertificatePinner? =
        if (BuildConfig.CERTIFICATE_PINNING_ENABLED) {
            productionPinner()
        } else {
            null
        }
}
