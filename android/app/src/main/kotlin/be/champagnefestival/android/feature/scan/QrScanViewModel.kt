package be.champagnefestival.android.feature.scan

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class QrScanViewModel : ViewModel() {
    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    fun reportError(message: String) {
        _errorMessage.value = message
    }

    fun parseQrPayload(rawValue: String): Pair<String, String>? {
        val parts = rawValue.split(":", limit = 2)
        return if (parts.size == 2 && parts[0].isNotBlank() && parts[1].isNotBlank()) {
            _errorMessage.value = null
            parts[0] to parts[1]
        } else {
            _errorMessage.value = "Invalid QR code. Expected registrationId:token."
            null
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }
}
