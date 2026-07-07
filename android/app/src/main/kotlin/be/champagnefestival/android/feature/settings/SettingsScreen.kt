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
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import be.champagnefestival.android.R
import be.champagnefestival.android.ui.UiState
import be.champagnefestival.android.ui.components.ErrorContent
import be.champagnefestival.android.ui.components.LoadingContent
import be.champagnefestival.android.ui.components.toStringRes

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(viewModel: SettingsViewModel, onBack: () -> Unit, onLoggedOut: () -> Unit) {
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
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.back_content_description)
                        )
                    }
                }
            )
        }
    ) { padding ->
        when (val state = uiState) {
            UiState.Loading -> LoadingContent(modifier = Modifier.padding(padding))
            is UiState.Error -> ErrorContent(message = stringResource(state.reason.toStringRes()), onRetry = {
            }, modifier = Modifier.padding(padding))
            is UiState.Success -> SettingsContent(
                viewModel = viewModel,
                settings = state.data,
                modifier = Modifier.padding(padding)
            )
        }
    }
}

@Composable
private fun SettingsContent(viewModel: SettingsViewModel, settings: SettingsUiModel, modifier: Modifier = Modifier) {
    val uriHandler = LocalUriHandler.current

    Column(
        modifier =
        modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        ApiBaseUrlOverrideCard(
            apiBaseUrl = settings.apiBaseUrl,
            defaultApiBaseUrl = settings.defaultApiBaseUrl,
            onSave = viewModel::saveApiBaseUrl,
            onReset = viewModel::resetApiBaseUrl
        )
        Text(stringResource(R.string.settings_oidc_config_format, settings.oidcConfigUrl))
        Text(stringResource(R.string.settings_app_version_format, settings.versionName))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(stringResource(R.string.settings_biometric_lock_label))
            Switch(
                checked = settings.biometricLockEnabled,
                onCheckedChange = viewModel::setBiometricLockEnabled
            )
        }
        Button(onClick = viewModel::logout) {
            Text(stringResource(R.string.settings_logout_button))
        }
        Button(onClick = { uriHandler.openUri(PRIVACY_POLICY_URL) }) {
            Text(stringResource(id = R.string.settings_privacy_and_deletion_options))
        }
    }
}

private const val PRIVACY_POLICY_URL = "https://champagnefestival.tjor.im/privacy"
