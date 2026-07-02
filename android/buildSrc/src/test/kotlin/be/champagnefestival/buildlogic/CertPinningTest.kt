package be.champagnefestival.buildlogic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class CertPinningTest {
    // ── resolvePins ──────────────────────────────────────────────────────────

    @Test
    fun `resolvePins splits on commas, trims whitespace, and drops blank entries`() {
        assertEquals(
            listOf("sha256/abc", "sha1/def"),
            CertPinning.resolvePins(" sha256/abc , sha1/def ,, "),
        )
    }

    @Test
    fun `resolvePins returns an empty list for null input`() {
        assertEquals(emptyList<String>(), CertPinning.resolvePins(null))
    }

    @Test
    fun `resolvePins returns an empty list for blank input`() {
        assertEquals(emptyList<String>(), CertPinning.resolvePins("   "))
    }

    @Test
    fun `resolvePins returns a single pin unchanged`() {
        assertEquals(listOf("sha256/abc"), CertPinning.resolvePins("sha256/abc"))
    }

    // ── requireValidPinFormats ───────────────────────────────────────────────

    // 44-char base64 (32 zero bytes) and 28-char base64 (20 zero bytes) — the
    // exact lengths OkHttp's CertificatePinner expects for sha256/sha1 hashes.
    private val validSha256Pin = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    private val validSha1Pin = "sha1/AAAAAAAAAAAAAAAAAAAAAAAAAAA="

    @Test
    fun `requireValidPinFormats accepts sha256 and sha1 pins`() {
        CertPinning.requireValidPinFormats(listOf(validSha256Pin, validSha1Pin))
    }

    @Test
    fun `requireValidPinFormats accepts an empty pin list`() {
        CertPinning.requireValidPinFormats(emptyList())
    }

    @Test
    fun `requireValidPinFormats rejects pins without a sha256 or sha1 prefix`() {
        val exception =
            assertThrows(IllegalStateException::class.java) {
                CertPinning.requireValidPinFormats(listOf(validSha256Pin, "md5/AAAAAAAAAAAAAAAAAAAAAAAAAAA="))
            }
        assertTrue(exception.message.orEmpty().contains("md5/AAAAAAAAAAAAAAAAAAAAAAAAAAA="))
    }

    @Test
    fun `requireValidPinFormats rejects a bare digest without a prefix`() {
        assertThrows(IllegalStateException::class.java) {
            CertPinning.requireValidPinFormats(listOf("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="))
        }
    }

    @Test
    fun `requireValidPinFormats rejects a pin with the wrong decoded length`() {
        val exception =
            assertThrows(IllegalStateException::class.java) {
                CertPinning.requireValidPinFormats(listOf("sha256/too-short"))
            }
        assertTrue(exception.message.orEmpty().contains("sha256/too-short"))
    }

    @Test
    fun `requireValidPinFormats rejects a pin with non-base64 characters`() {
        assertThrows(IllegalStateException::class.java) {
            CertPinning.requireValidPinFormats(listOf("sha256/not valid base64!!"))
        }
    }

    @Test
    fun `requireValidPinFormats rejects an empty hash after the prefix`() {
        assertThrows(IllegalStateException::class.java) {
            CertPinning.requireValidPinFormats(listOf("sha256/"))
        }
    }

    // ── requireHostForPins ───────────────────────────────────────────────────

    @Test
    fun `requireHostForPins passes when pins are configured and host is set`() {
        CertPinning.requireHostForPins(listOf("sha256/abc"), "champagnefestival.tjor.im")
    }

    @Test
    fun `requireHostForPins passes when no pins are configured, regardless of host`() {
        CertPinning.requireHostForPins(emptyList(), "")
    }

    @Test
    fun `requireHostForPins fails when pins are configured but host is blank`() {
        val exception =
            assertThrows(IllegalStateException::class.java) {
                CertPinning.requireHostForPins(listOf("sha256/abc"), "")
            }
        assertTrue(exception.message.orEmpty().contains("CHAMPAGNEFESTIVAL_ANDROID_PROD_CERTIFICATE_PIN_HOST"))
    }

    @Test
    fun `requireHostForPins fails when pins are configured but host is whitespace only`() {
        assertThrows(IllegalStateException::class.java) {
            CertPinning.requireHostForPins(listOf("sha256/abc"), "   ")
        }
    }
}
