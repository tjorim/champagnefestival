package be.champagnefestival.android.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import be.champagnefestival.android.R
import be.champagnefestival.android.data.repository.ApiErrorReason

@Composable
fun errorMessage(reason: ApiErrorReason): String = when (reason) {
    ApiErrorReason.NETWORK_UNAVAILABLE -> stringResource(R.string.error_network_unavailable)
    ApiErrorReason.CERTIFICATE_UNTRUSTED -> stringResource(R.string.error_certificate_untrusted)
    ApiErrorReason.UNAUTHORIZED -> stringResource(R.string.error_unauthorized)
    ApiErrorReason.SERVER_ERROR -> stringResource(R.string.error_server)
    ApiErrorReason.UNKNOWN -> stringResource(R.string.error_unknown)
}
