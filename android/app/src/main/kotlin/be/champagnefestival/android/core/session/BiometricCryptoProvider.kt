package be.champagnefestival.android.core.session

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricPrompt
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
private const val KEY_ALIAS = "champagnefestival_biometric_gate_key"
private const val TRANSFORMATION =
    "${KeyProperties.KEY_ALGORITHM_AES}/${KeyProperties.BLOCK_MODE_CBC}/${KeyProperties.ENCRYPTION_PADDING_PKCS7}"

/**
 * Backs the biometric prompt with a real AndroidKeyStore secret key that requires
 * authentication to use, so a successful [BiometricPrompt] callback reflects an
 * actual keystore-verified unlock rather than just a UI dismissal.
 */
class BiometricCryptoProvider {
    fun createCryptoObject(): BiometricPrompt.CryptoObject? =
        runCatching { BiometricPrompt.CryptoObject(buildCipher()) }
            .recoverCatching {
                // Enrolled credentials changed since the key was created; start over with a fresh key.
                deleteKey()
                BiometricPrompt.CryptoObject(buildCipher())
            }.getOrNull()

    private fun buildCipher(): Cipher =
        Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        val spec =
            KeyGenParameterSpec
                .Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_CBC)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_PKCS7)
                .setUserAuthenticationRequired(true)
                .build()
        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }

    private fun deleteKey() {
        runCatching {
            KeyStore.getInstance(KEYSTORE_PROVIDER).apply {
                load(null)
                deleteEntry(KEY_ALIAS)
            }
        }
    }
}
