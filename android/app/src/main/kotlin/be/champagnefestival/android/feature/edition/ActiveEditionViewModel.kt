package be.champagnefestival.android.feature.edition

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.champagnefestival.android.data.model.EditionOut
import be.champagnefestival.android.data.repository.EditionRepository
import be.champagnefestival.android.data.repository.toApiErrorReason
import be.champagnefestival.android.ui.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ActiveEditionViewModel(private val repository: EditionRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState<EditionOut>>(UiState.Loading)
    val uiState: StateFlow<UiState<EditionOut>> = _uiState.asStateFlow()

    init {
        loadActiveEdition()
    }

    fun loadActiveEdition() {
        _uiState.value = UiState.Loading
        viewModelScope.launch {
            repository
                .getActiveEdition()
                .onSuccess { _uiState.value = UiState.Success(it) }
                .onFailure { _uiState.value = UiState.Error(it.toApiErrorReason()) }
        }
    }
}
