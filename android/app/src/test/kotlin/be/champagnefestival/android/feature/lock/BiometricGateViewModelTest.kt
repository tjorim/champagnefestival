package be.champagnefestival.android.feature.lock

import androidx.biometric.BiometricPrompt
import be.champagnefestival.android.core.session.BiometricLockController
import io.mockk.mockk
import io.mockk.verify
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BiometricGateViewModelTest {
    private val controller = mockk<BiometricLockController>(relaxed = true)

    @Test
    fun `initial state is checking`() {
        val viewModel = BiometricGateViewModel(controller)

        assertEquals(LockUiState.Checking, viewModel.uiState.value)
    }

    @Test
    fun `continueWithoutBiometric unlocks the controller`() {
        val viewModel = BiometricGateViewModel(controller)

        viewModel.continueWithoutBiometric()

        verify { controller.markUnlocked() }
    }

    @Test
    fun `isVerifiedUnlock is false for a null crypto object`() {
        val cryptoObject: BiometricPrompt.CryptoObject? = null

        assertFalse(cryptoObject.isVerifiedUnlock())
    }

    @Test
    fun `isVerifiedUnlock is false when the cipher was never initialized`() {
        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        val cryptoObject = BiometricPrompt.CryptoObject(cipher)

        assertFalse(cryptoObject.isVerifiedUnlock())
    }

    @Test
    fun `isVerifiedUnlock is true when the cipher completes a real operation`() {
        val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding").apply { init(Cipher.ENCRYPT_MODE, key) }
        val cryptoObject = BiometricPrompt.CryptoObject(cipher)

        assertTrue(cryptoObject.isVerifiedUnlock())
    }
}
