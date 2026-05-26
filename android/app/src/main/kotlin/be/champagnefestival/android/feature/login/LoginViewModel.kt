package be.champagnefestival.android.feature.login

import android.app.Activity
import androidx.lifecycle.ViewModel
import be.champagnefestival.android.core.auth.AuthManager
import be.champagnefestival.android.ui.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class LoginViewModel(private val authManager: AuthManager) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState<Unit>>(UiState.Success(Unit))
    val uiState: StateFlow<UiState<Unit>> = _uiState.asStateFlow()

    val loggedIn = authManager.loggedIn

    fun startLogin(activity: Activity) {
        _uiState.value = UiState.Loading
        authManager.startLogin(activity)
        _uiState.value = UiState.Success(Unit)
    }
}
