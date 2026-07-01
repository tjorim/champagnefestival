package be.champagnefestival.android.feature.lookup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.data.repository.CheckInRepository
import be.champagnefestival.android.data.repository.UnauthorizedException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class GuestLookupUiState {
    data object Idle : GuestLookupUiState()

    data object Loading : GuestLookupUiState()

    data class Success(
        val registrations: List<CheckInGuestOut>,
    ) : GuestLookupUiState()

    data class Error(
        val message: String,
    ) : GuestLookupUiState()
}

class GuestLookupViewModel(
    private val repository: CheckInRepository,
    private val authTokenProvider: () -> String?,
) : ViewModel() {
    private val _uiState = MutableStateFlow<GuestLookupUiState>(GuestLookupUiState.Idle)
    val uiState: StateFlow<GuestLookupUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null

    fun search(
        query: String,
        eventId: String?,
    ) {
        searchJob?.cancel()
        if (query.isBlank() && eventId.isNullOrBlank()) {
            _uiState.value = GuestLookupUiState.Idle
            return
        }
        searchJob =
            viewModelScope.launch {
                delay(300)
                _uiState.value = GuestLookupUiState.Loading
                val authToken = authTokenProvider()
                if (authToken.isNullOrBlank()) {
                    _uiState.value = GuestLookupUiState.Error("Sign in again to search registrations.")
                    return@launch
                }

                repository
                    .searchRegistrations(query = query, eventId = eventId, authToken = authToken)
                    .onSuccess { _uiState.value = GuestLookupUiState.Success(it) }
                    .onFailure {
                        _uiState.value =
                            GuestLookupUiState.Error(
                                when (it) {
                                    is UnauthorizedException -> it.message ?: "Unauthorized"
                                    else -> it.message ?: "Unable to search registrations."
                                },
                            )
                    }
            }
    }
}
