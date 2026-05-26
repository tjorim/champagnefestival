package be.champagnefestival.android.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.champagnefestival.android.BuildConfig
import be.champagnefestival.android.core.auth.AuthManager
import be.champagnefestival.android.core.storage.SessionDataStore
import be.champagnefestival.android.ui.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val sessionDataStore: SessionDataStore,
    private val authManager: AuthManager,
) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState<SettingsUiModel>>(UiState.Loading)
    val uiState: StateFlow<UiState<SettingsUiModel>> = _uiState.asStateFlow()

    private val _loggedOut = MutableStateFlow(false)
    val loggedOut: StateFlow<Boolean> = _loggedOut.asStateFlow()

    init {
        viewModelScope.launch {
            sessionDataStore.apiBaseUrlFlow.collect { apiBaseUrl ->
                _uiState.value = UiState.Success(
                    SettingsUiModel(
                        apiBaseUrl = apiBaseUrl,
                        defaultApiBaseUrl = BuildConfig.API_BASE_URL,
                        oidcIssuerUrl = BuildConfig.OIDC_ISSUER_URL,
                        versionName = BuildConfig.VERSION_NAME,
                    ),
                )
            }
        }
    }

    fun saveApiBaseUrl(url: String) {
        viewModelScope.launch {
            if (url.isBlank()) {
                sessionDataStore.clearApiBaseUrlOverride()
            } else {
                sessionDataStore.saveApiBaseUrl(url)
            }
        }
    }

    fun resetApiBaseUrl() {
        viewModelScope.launch {
            sessionDataStore.clearApiBaseUrlOverride()
        }
    }

    fun logout() {
        viewModelScope.launch {
            authManager.logout()
            _loggedOut.value = true
        }
    }
}

data class SettingsUiModel(
    val apiBaseUrl: String,
    val defaultApiBaseUrl: String,
    val oidcIssuerUrl: String,
    val versionName: String,
)
