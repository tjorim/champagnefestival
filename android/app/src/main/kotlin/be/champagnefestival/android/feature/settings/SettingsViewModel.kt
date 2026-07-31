package be.champagnefestival.android.feature.settings

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.champagnefestival.android.BuildConfig
import be.champagnefestival.android.core.auth.AuthManager
import be.champagnefestival.android.core.storage.ApiBaseUrlOverrideStore
import be.champagnefestival.android.core.storage.BiometricLockPreferencesStore
import be.champagnefestival.android.ui.UiState
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val apiBaseUrlOverrideStore: ApiBaseUrlOverrideStore,
    private val biometricLockPreferencesStore: BiometricLockPreferencesStore,
    private val authManager: AuthManager
) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState<SettingsUiModel>>(UiState.Loading)
    val uiState: StateFlow<UiState<SettingsUiModel>> = _uiState.asStateFlow()

    private val _loggedOut = MutableStateFlow(false)
    val loggedOut: StateFlow<Boolean> = _loggedOut.asStateFlow()

    private val _isLoggingOut = MutableStateFlow(false)
    val isLoggingOut: StateFlow<Boolean> = _isLoggingOut.asStateFlow()

    // Buffered so an emission isn't dropped if the collecting composable's LaunchedEffect
    // hasn't started yet when logout() fires.
    private val _logoutIntent = MutableSharedFlow<Intent>(extraBufferCapacity = 1)
    val logoutIntent: SharedFlow<Intent> = _logoutIntent.asSharedFlow()

    private var loadSettingsJob: Job? = null

    init {
        loadSettings()
    }

    /**
     * (Re)subscribes to the settings-backing preference flows. Also the target of the
     * error screen's Retry button — that button must do something real rather than the
     * no-op it started as, even though these flows only ever resolve to Success today.
     * Cancels any prior collection first so a repeat call can't leak a second live
     * collector alongside the first.
     */
    fun loadSettings() {
        loadSettingsJob?.cancel()
        loadSettingsJob = viewModelScope.launch {
            apiBaseUrlOverrideStore.override
                .combine(biometricLockPreferencesStore.biometricLockEnabledFlow) { apiBaseUrl, biometricLockEnabled ->
                    // Null while the persisted lock setting is still loading; wait for it so the
                    // toggle doesn't flash the wrong state.
                    biometricLockEnabled?.let {
                        SettingsUiModel(
                            apiBaseUrl = apiBaseUrl ?: BuildConfig.API_BASE_URL,
                            defaultApiBaseUrl = BuildConfig.API_BASE_URL,
                            oidcConfigUrl = "${(apiBaseUrl ?: BuildConfig.API_BASE_URL).trimEnd(
                                '/'
                            )}/api/auth/oidc-config",
                            versionName = BuildConfig.VERSION_NAME,
                            biometricLockEnabled = it
                        )
                    }
                }.filterNotNull()
                .collect { model ->
                    _uiState.value = UiState.Success(model)
                }
        }
    }

    fun saveApiBaseUrl(url: String) {
        viewModelScope.launch {
            if (url.isBlank()) {
                apiBaseUrlOverrideStore.clearOverride()
            } else {
                apiBaseUrlOverrideStore.setOverride(url)
            }
        }
    }

    fun resetApiBaseUrl() {
        viewModelScope.launch {
            apiBaseUrlOverrideStore.clearOverride()
        }
    }

    fun setBiometricLockEnabled(enabled: Boolean) {
        viewModelScope.launch {
            biometricLockPreferencesStore.setBiometricLockEnabled(enabled)
        }
    }

    /**
     * Starts sign-out. This only builds the Keycloak end-session intent and hands it to
     * the UI via [logoutIntent] to launch with an `ActivityResultLauncher` — it does not
     * clear local state or flip [loggedOut] itself. That happens in [onLogoutFlowFinished],
     * called once that launch returns control to the app, so the app never reports itself
     * signed out before the end-session round trip has had a chance to run (see
     * [AuthManager.buildLogoutIntent]). Guard against a double-tap firing two end-session
     * activities while the button still looks idle.
     */
    fun logout() {
        if (_isLoggingOut.value) return
        viewModelScope.launch {
            _isLoggingOut.value = true
            val intent = authManager.buildLogoutIntent()
            if (intent != null) {
                _logoutIntent.emit(intent)
            } else {
                completeLogout()
            }
        }
    }

    /**
     * Finishes sign-out once the end-session activity launched from [logoutIntent] returns
     * control to the app. Called for every outcome (completed or cancelled) — the point
     * isn't to distinguish those, just to stop reporting "logged out" before the browser
     * step has run at all.
     */
    fun onLogoutFlowFinished() {
        completeLogout()
    }

    private fun completeLogout() {
        authManager.completeLogout()
        _loggedOut.value = true
    }
}

data class SettingsUiModel(
    val apiBaseUrl: String,
    val defaultApiBaseUrl: String,
    val oidcConfigUrl: String,
    val versionName: String,
    val biometricLockEnabled: Boolean
)
