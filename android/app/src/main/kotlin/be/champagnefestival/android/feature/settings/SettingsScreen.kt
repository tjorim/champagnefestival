package be.champagnefestival.android.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import be.champagnefestival.android.ui.UiState
import be.champagnefestival.android.ui.components.ErrorContent
import be.champagnefestival.android.ui.components.LoadingContent

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    onBack: () -> Unit,
    onLoggedOut: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    val loggedOut by viewModel.loggedOut.collectAsState()

    LaunchedEffect(loggedOut) {
        if (loggedOut) {
            onLoggedOut()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        when (val state = uiState) {
            UiState.Loading -> LoadingContent(modifier = Modifier.padding(padding))
            is UiState.Error -> ErrorContent(message = state.message, onRetry = {}, modifier = Modifier.padding(padding))
            is UiState.Success -> SettingsContent(viewModel = viewModel, settings = state.data, modifier = Modifier.padding(padding))
        }
    }
}

@Composable
private fun SettingsContent(
    viewModel: SettingsViewModel,
    settings: SettingsUiModel,
    modifier: Modifier = Modifier,
) {
    var apiBaseUrl by remember(settings.apiBaseUrl) { mutableStateOf(settings.apiBaseUrl) }
    val isUrlInvalid = apiBaseUrl.isNotBlank() && !apiBaseUrl.startsWith("http://") && !apiBaseUrl.startsWith("https://")

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        OutlinedTextField(
            value = apiBaseUrl,
            onValueChange = { apiBaseUrl = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("API base URL") },
            isError = isUrlInvalid,
            supportingText = {
                if (isUrlInvalid) {
                    Text("URL must start with http:// or https://")
                }
            },
        )
        Text("Default API base URL: ${settings.defaultApiBaseUrl}")
        Text("OIDC issuer: ${settings.oidcIssuerUrl}")
        Text("App version: ${settings.versionName}")
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Require biometric unlock")
            Switch(
                checked = settings.biometricLockEnabled,
                onCheckedChange = viewModel::setBiometricLockEnabled,
            )
        }
        Button(
            onClick = { viewModel.saveApiBaseUrl(apiBaseUrl) },
            enabled = !isUrlInvalid,
        ) {
            Text("Save base URL")
        }
        Button(onClick = {
            apiBaseUrl = settings.defaultApiBaseUrl
            viewModel.resetApiBaseUrl()
        }) {
            Text("Reset base URL")
        }
        Button(onClick = viewModel::logout) {
            Text("Logout")
        }
    }
}
