package be.champagnefestival.android.feature.login

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.champagnefestival.android.core.auth.AuthManager
import be.champagnefestival.android.data.repository.toApiErrorReason
import be.champagnefestival.android.ui.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class LoginViewModel(private val authManager: AuthManager) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState<Unit>>(UiState.Success(Unit))
    val uiState: StateFlow<UiState<Unit>> = _uiState.asStateFlow()

    val loggedIn = authManager.loggedIn

    fun startLogin(activity: Activity) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            _uiState.value =
                authManager.startLogin(activity).fold(
                    onSuccess = { UiState.Success(Unit) },
                    onFailure = { error -> UiState.Error(error.toApiErrorReason()) }
                )
        }
    }
}
