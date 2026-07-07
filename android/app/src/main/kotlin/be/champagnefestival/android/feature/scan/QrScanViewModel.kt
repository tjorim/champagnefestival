package be.champagnefestival.android.feature.scan

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class QrScanViewModel : ViewModel() {
    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private var lastInvalidPayload: String? = null

    fun reportError(message: String) {
        _errorMessage.value = message
    }

    fun parseQrPayload(rawValue: String, invalidPayloadMessage: String): Pair<String, String>? {
        val parts = rawValue.split(":", limit = 2)
        return if (parts.size == 2 && parts[0].isNotBlank() && parts[1].isNotBlank()) {
            _errorMessage.value = null
            lastInvalidPayload = null
            parts[0] to parts[1]
        } else {
            if (lastInvalidPayload != rawValue) {
                lastInvalidPayload = rawValue
                _errorMessage.value = invalidPayloadMessage
            }
            null
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }
}
