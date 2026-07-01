package be.champagnefestival.android.core.network

import okhttp3.CertificatePinner
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class CertificatePinnerProviderTest {
    @Test
    fun fallsBackToDefaultVerificationWhenPinningDisabled() {
        val pinner =
            CertificatePinnerProvider.fromConfig(
                enabled = false,
                host = "champagnefestival.tjor.im",
                pins = listOf("sha256/y7xVm0TVJNahMr2sZydE2jQH8SquXV9yLF9seROHHHU="),
            )

        assertEquals(CertificatePinner.DEFAULT, pinner)
    }

    @Test
    fun createsPinnerWhenEnabledWithHostAndPins() {
        val pinner =
            CertificatePinnerProvider.fromConfig(
                enabled = true,
                host = "champagnefestival.tjor.im",
                pins = listOf("sha256/y7xVm0TVJNahMr2sZydE2jQH8SquXV9yLF9seROHHHU="),
            )

        assertNotEquals(CertificatePinner.DEFAULT, pinner)
    }

    @Test
    fun fallsBackToDefaultVerificationWhenPinsAreEmpty() {
        val pinner =
            CertificatePinnerProvider.fromConfig(
                enabled = true,
                host = "champagnefestival.tjor.im",
                pins = emptyList(),
            )

        assertEquals(CertificatePinner.DEFAULT, pinner)
    }

    @Test
    fun fallsBackToDefaultVerificationWhenHostIsEmpty() {
        val pinner =
            CertificatePinnerProvider.fromConfig(
                enabled = true,
                host = "",
                pins = listOf("sha256/y7xVm0TVJNahMr2sZydE2jQH8SquXV9yLF9seROHHHU="),
            )

        assertEquals(CertificatePinner.DEFAULT, pinner)
    }
}
