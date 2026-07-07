package be.champagnefestival.android.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import be.champagnefestival.android.R
import be.champagnefestival.android.core.network.DynamicBaseUrlInterceptor

/**
 * Lets the user override the API base URL at runtime (e.g. to point the app at a
 * local backend) and shows the build's default for reference. Validation reuses
 * [DynamicBaseUrlInterceptor.isValidOverride] so the UI stays in sync with the rule the
 * interceptor itself applies when rewriting requests.
 */
@Composable
fun ApiBaseUrlOverrideCard(
    apiBaseUrl: String,
    defaultApiBaseUrl: String,
    onSave: (String) -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier
) {
    var apiBaseUrlInput by remember(apiBaseUrl) { mutableStateOf(apiBaseUrl) }
    val isUrlInvalid = apiBaseUrlInput.isNotBlank() && !DynamicBaseUrlInterceptor.isValidOverride(apiBaseUrlInput)

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        OutlinedTextField(
            value = apiBaseUrlInput,
            onValueChange = { apiBaseUrlInput = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.settings_api_base_url_label)) },
            isError = isUrlInvalid,
            supportingText = {
                if (isUrlInvalid) {
                    Text(stringResource(R.string.settings_api_base_url_error))
                }
            }
        )
        Text(stringResource(R.string.settings_api_base_url_default_format, defaultApiBaseUrl))
        Button(
            onClick = { onSave(apiBaseUrlInput) },
            enabled = !isUrlInvalid
        ) {
            Text(stringResource(R.string.settings_api_base_url_save_button))
        }
        Button(onClick = {
            apiBaseUrlInput = defaultApiBaseUrl
            onReset()
        }) {
            Text(stringResource(R.string.settings_api_base_url_reset_button))
        }
    }
}
