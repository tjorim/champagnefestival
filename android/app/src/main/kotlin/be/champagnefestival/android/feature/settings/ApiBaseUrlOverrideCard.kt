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
import androidx.compose.ui.unit.dp
import be.champagnefestival.android.core.network.DynamicBaseUrlInterceptor

/**
 * Lets the user override the API base URL at runtime (e.g. to point the app at a staging or
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
    modifier: Modifier = Modifier,
) {
    var apiBaseUrlInput by remember(apiBaseUrl) { mutableStateOf(apiBaseUrl) }
    val isUrlInvalid = apiBaseUrlInput.isNotBlank() && !DynamicBaseUrlInterceptor.isValidOverride(apiBaseUrlInput)

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        OutlinedTextField(
            value = apiBaseUrlInput,
            onValueChange = { apiBaseUrlInput = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("API base URL") },
            isError = isUrlInvalid,
            supportingText = {
                if (isUrlInvalid) {
                    Text("URL must start with http:// or https://")
                }
            },
        )
        Text("Default API base URL: $defaultApiBaseUrl")
        Button(
            onClick = { onSave(apiBaseUrlInput) },
            enabled = !isUrlInvalid,
        ) {
            Text("Save base URL")
        }
        Button(onClick = {
            apiBaseUrlInput = defaultApiBaseUrl
            onReset()
        }) {
            Text("Reset base URL")
        }
    }
}
