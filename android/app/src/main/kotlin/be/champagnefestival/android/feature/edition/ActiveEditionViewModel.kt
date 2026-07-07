package be.champagnefestival.android.feature.edition

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import be.champagnefestival.android.data.model.EditionOut
import be.champagnefestival.android.data.model.EventCheckInStats
import be.champagnefestival.android.data.repository.EditionRepository
import be.champagnefestival.android.data.repository.toApiErrorReason
import be.champagnefestival.android.ui.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ActiveEditionViewModel(
    private val repository: EditionRepository,
    private val authTokenProvider: () -> String?
) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState<EditionOut>>(UiState.Loading)
    val uiState: StateFlow<UiState<EditionOut>> = _uiState.asStateFlow()

    private val _checkInStats = MutableStateFlow<Map<String, EventCheckInStats>>(emptyMap())
    val checkInStats: StateFlow<Map<String, EventCheckInStats>> = _checkInStats.asStateFlow()

    init {
        loadActiveEdition()
    }

    fun loadActiveEdition() {
        _uiState.value = UiState.Loading
        _checkInStats.value = emptyMap()
        viewModelScope.launch {
            repository
                .getActiveEdition()
                .onSuccess { edition ->
                    _uiState.value = UiState.Success(edition)
                    loadCheckInStats(edition.id)
                }.onFailure { _uiState.value = UiState.Error(it.toApiErrorReason()) }
        }
    }

    /**
     * Live check-in progress per event, e.g. for a "142 / 300 checked in" display. Best-effort:
     * failures are swallowed rather than surfaced, since this is supplementary information and
     * shouldn't block the rest of the edition screen from working.
     */
    private fun loadCheckInStats(editionId: String) {
        val authToken = authTokenProvider() ?: return
        viewModelScope.launch {
            repository
                .getCheckInStats(editionId = editionId, authToken = authToken)
                .onSuccess { stats -> _checkInStats.value = stats.associateBy { it.event_id } }
        }
    }
}
