package be.champagnefestival.android.feature.registration

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.champagnefestival.android.core.network.ConnectivityObserver
import be.champagnefestival.android.core.storage.PendingCheckInStore
import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.data.model.PendingCheckIn
import be.champagnefestival.android.data.repository.ApiErrorReason
import be.champagnefestival.android.data.repository.CheckInRepository
import be.champagnefestival.android.data.repository.UnauthorizedException
import be.champagnefestival.android.data.repository.toApiErrorReason
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class CheckInUiState {
    data object Loading : CheckInUiState()

    data class RegistrationLoaded(val registration: CheckInGuestOut) : CheckInUiState()

    data class CheckInSuccess(val registration: CheckInGuestOut, val alreadyCheckedIn: Boolean) : CheckInUiState()

    /** Saved locally because the device is offline; will submit automatically once reconnected. */
    data object Queued : CheckInUiState()

    data class Error(val reason: ApiErrorReason) : CheckInUiState()

    data object Unauthorized : CheckInUiState()
}

class CheckInViewModel(
    private val repository: CheckInRepository,
    private val connectivityObserver: ConnectivityObserver,
    private val pendingCheckInStore: PendingCheckInStore
) : ViewModel() {
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
                            CheckInUiState.Error(error.toApiErrorReason())
                        }
                }
        }
    }

    fun submitCheckIn(id: String, token: String) {
        if (lastSubmittedId == id && isInFlightOrDone()) {
            return
        }
        lastSubmittedId = id
        _uiState.value = CheckInUiState.Loading
        viewModelScope.launch {
            if (connectivityObserver.isOnline.value == false) {
                queueOffline(id, token)
                return@launch
            }
            val result = repository.submitCheckIn(id = id, token = token)
            val error = result.exceptionOrNull()
            when {
                result.isSuccess -> {
                    val output = result.getOrThrow()
                    _uiState.value = CheckInUiState.CheckInSuccess(output.registration, output.already_checked_in)
                }
                error is UnauthorizedException -> _uiState.value = CheckInUiState.Unauthorized
                error?.toApiErrorReason() == ApiErrorReason.NETWORK_UNAVAILABLE -> queueOffline(id, token)
                else -> _uiState.value = CheckInUiState.Error(error?.toApiErrorReason() ?: ApiErrorReason.UNKNOWN)
            }
        }
    }

    private fun isInFlightOrDone(): Boolean = when (_uiState.value) {
        CheckInUiState.Loading, is CheckInUiState.CheckInSuccess, CheckInUiState.Queued -> true
        else -> false
    }

    private suspend fun queueOffline(id: String, token: String) {
        pendingCheckInStore.enqueue(
            PendingCheckIn(id = id, token = token, queuedAtEpochMillis = System.currentTimeMillis())
        )
        _uiState.value = CheckInUiState.Queued
    }
}
