package be.champagnefestival.android.ui.components

import androidx.annotation.StringRes
import be.champagnefestival.android.R
import be.champagnefestival.android.data.repository.ApiErrorReason

@StringRes
fun ApiErrorReason.toStringRes(): Int = when (this) {
    ApiErrorReason.NETWORK_UNAVAILABLE -> R.string.error_network_unavailable
    ApiErrorReason.CERTIFICATE_UNTRUSTED -> R.string.error_certificate_untrusted
    ApiErrorReason.UNAUTHORIZED -> R.string.error_unauthorized
    ApiErrorReason.SERVER_ERROR -> R.string.error_server
    ApiErrorReason.UNKNOWN -> R.string.error_unknown
}
