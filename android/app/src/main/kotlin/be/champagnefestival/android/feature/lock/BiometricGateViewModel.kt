package be.champagnefestival.android.feature.lock

import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModel
import be.champagnefestival.android.core.session.BiometricCryptoProvider
import be.champagnefestival.android.core.session.BiometricLockController
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private const val ALLOWED_AUTHENTICATORS =
    BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL

sealed class LockUiState {
    data object Checking : LockUiState()

    data object Prompting : LockUiState()

    data class NoCredentialEnrolled(val message: String) : LockUiState()

    data class Failed(val message: String) : LockUiState()
}

/**
 * Localized copy for the biometric lock screen, supplied by the caller since [ViewModel]s
 * have no Compose context to resolve string resources themselves.
 */
data class BiometricPromptStrings(
    val noCredentialEnrolledMessage: String,
    val authenticationFailedMessage: String,
    val cryptoUnavailableMessage: String,
    val promptTitle: String,
    val promptSubtitle: String
)

class BiometricGateViewModel(
    private val controller: BiometricLockController,
    private val cryptoProvider: BiometricCryptoProvider = BiometricCryptoProvider()
) : ViewModel() {
    private val _uiState = MutableStateFlow<LockUiState>(LockUiState.Checking)
    val uiState: StateFlow<LockUiState> = _uiState.asStateFlow()

    fun authenticate(activity: FragmentActivity, strings: BiometricPromptStrings) {
        when (BiometricManager.from(activity).canAuthenticate(ALLOWED_AUTHENTICATORS)) {
            BiometricManager.BIOMETRIC_SUCCESS -> promptForAuthentication(activity, strings)
            else -> _uiState.value = LockUiState.NoCredentialEnrolled(strings.noCredentialEnrolledMessage)
        }
    }

    /** Fallback for devices with no enrolled biometric/device credential. */
    fun continueWithoutBiometric() {
        controller.markUnlocked()
    }

    private fun promptForAuthentication(activity: FragmentActivity, strings: BiometricPromptStrings) {
        _uiState.value = LockUiState.Prompting

        val callback =
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val cryptoObject = result.cryptoObject
                    val hasCryptoPrimitive =
                        cryptoObject?.cipher != null || cryptoObject?.signature != null || cryptoObject?.mac != null

                    if (!hasCryptoPrimitive) {
                        _uiState.value = LockUiState.Failed(strings.cryptoUnavailableMessage)
                        return
                    }

                    controller.markUnlocked()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    _uiState.value = LockUiState.Failed(errString.toString())
                }

                override fun onAuthenticationFailed() {
                    _uiState.value = LockUiState.Failed(strings.authenticationFailedMessage)
                }
            }

        val prompt = BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), callback)
        val promptInfo =
            BiometricPrompt.PromptInfo
                .Builder()
                .setTitle(strings.promptTitle)
                .setSubtitle(strings.promptSubtitle)
                .setAllowedAuthenticators(ALLOWED_AUTHENTICATORS)
                .build()

        // BiometricPrompt rejects a CryptoObject combined with DEVICE_CREDENTIAL below API 30
        // (IllegalArgumentException), so only the keystore-verified path is available on R+.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val cryptoObject = cryptoProvider.createCryptoObject()
            if (cryptoObject == null) {
                _uiState.value = LockUiState.Failed(strings.cryptoUnavailableMessage)
                return
            }
            prompt.authenticate(promptInfo, cryptoObject)
        } else {
            _uiState.value = LockUiState.Failed(strings.cryptoUnavailableMessage)
        }
    }
}
