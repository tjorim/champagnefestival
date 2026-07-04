package be.champagnefestival.android.feature.registration

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.data.repository.CheckInRepository
import be.champagnefestival.android.data.repository.UnauthorizedException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class CheckInUiState {
    data object Loading : CheckInUiState()

    data class RegistrationLoaded(val registration: CheckInGuestOut) : CheckInUiState()

    data class CheckInSuccess(val registration: CheckInGuestOut, val alreadyCheckedIn: Boolean) : CheckInUiState()

    data class Error(val message: String) : CheckInUiState()

    data object Unauthorized : CheckInUiState()
}

class CheckInViewModel(private val repository: CheckInRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<CheckInUiState>(CheckInUiState.Loading)
    val uiState: StateFlow<CheckInUiState> = _uiState.asStateFlow()

    private var lastSubmittedId: String? = null

    fun loadRegistration(id: String, token: String) {
        _uiState.value = CheckInUiState.Loading
        viewModelScope.launch {
            repository
                .lookupRegistration(id = id, token = token)
                .onSuccess { _uiState.value = CheckInUiState.RegistrationLoaded(it) }
                .onFailure { error ->
                    _uiState.value =
                        if (error is UnauthorizedException) {
                            CheckInUiState.Unauthorized
                        } else {
                            CheckInUiState.Error(error.message ?: "Unable to load registration.")
                        }
                }
        }
    }

    fun submitCheckIn(id: String, token: String) {
        if (lastSubmittedId == id && _uiState.value is CheckInUiState.Loading) {
            return
        }
        if (lastSubmittedId == id && _uiState.value is CheckInUiState.CheckInSuccess) {
            return
        }
        _uiState.value = CheckInUiState.Loading
        lastSubmittedId = id
        viewModelScope.launch {
            repository
                .submitCheckIn(id = id, token = token)
                .onSuccess { result ->
                    _uiState.value =
                        CheckInUiState.CheckInSuccess(
                            registration = result.registration,
                            alreadyCheckedIn = result.already_checked_in
                        )
                }.onFailure { error ->
                    _uiState.value =
                        if (error is UnauthorizedException) {
                            CheckInUiState.Unauthorized
                        } else {
                            CheckInUiState.Error(error.message ?: "Unable to submit check-in.")
                        }
                }
        }
    }
}
