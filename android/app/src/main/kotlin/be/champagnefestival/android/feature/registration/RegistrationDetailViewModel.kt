package be.champagnefestival.android.feature.registration

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.data.repository.CheckInRepository
import be.champagnefestival.android.ui.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class RegistrationDetailViewModel(
    private val repository: CheckInRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState<CheckInGuestOut>>(UiState.Loading)
    val uiState: StateFlow<UiState<CheckInGuestOut>> = _uiState.asStateFlow()

    fun loadRegistration(
        id: String,
        token: String,
    ) {
        _uiState.value = UiState.Loading
        viewModelScope.launch {
            repository
                .lookupRegistration(id = id, token = token)
                .onSuccess { _uiState.value = UiState.Success(it) }
                .onFailure { _uiState.value = UiState.Error(it.message ?: "Unable to load registration.") }
        }
    }
}
