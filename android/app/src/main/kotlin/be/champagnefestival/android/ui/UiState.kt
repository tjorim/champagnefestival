package be.champagnefestival.android.ui

import be.champagnefestival.android.data.repository.ApiErrorReason

sealed class UiState<out T> {
    data object Loading : UiState<Nothing>()

    data class Success<T>(val data: T) : UiState<T>()

    data class Error(val reason: ApiErrorReason) : UiState<Nothing>()
}
