package be.champagnefestival.android.feature.lock

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.viewmodel.compose.viewModel
import be.champagnefestival.android.ChampagneFestivalApp
import be.champagnefestival.android.R
import be.champagnefestival.android.core.di.simpleFactory

/**
 * Wraps [content] with an app-lock screen. Renders the gate instead of [content] whenever
 * the biometric lock is enabled and the idle timeout has elapsed since backgrounding, so no
 * cached guest/registration data is shown before re-authentication succeeds.
 */
@Composable
fun BiometricGate(app: ChampagneFestivalApp, content: @Composable () -> Unit) {
    val lockEnabled by app.biometricLockController.lockEnabledFlow.collectAsState()
    val locked by app.biometricLockController.isLocked.collectAsState()
    val activity = LocalActivity.current as? FragmentActivity

    // Still loading the persisted setting from DataStore: render nothing rather than
    // flashing the lock screen (or skipping it) based on a not-yet-confirmed default.
    if (lockEnabled == null) {
        return
    }

    if (lockEnabled == false || !locked || activity == null) {
        content()
        return
    }

    val viewModel: BiometricGateViewModel =
        viewModel(factory = simpleFactory { BiometricGateViewModel(app.biometricLockController) })
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.authenticate(activity)
    }

    LockScreenContent(
        uiState = uiState,
        onRetry = { viewModel.authenticate(activity) },
        onContinueWithoutBiometric = viewModel::continueWithoutBiometric
    )
}

@Composable
private fun LockScreenContent(uiState: LockUiState, onRetry: () -> Unit, onContinueWithoutBiometric: () -> Unit) {
    Scaffold { padding ->
        Column(
            modifier =
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(Icons.Filled.Lock, contentDescription = null, modifier = Modifier.size(48.dp))
            Spacer(modifier = Modifier.height(16.dp))
            Text(stringResource(R.string.lock_title), style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(24.dp))
            when (uiState) {
                LockUiState.Checking, LockUiState.Prompting -> CircularProgressIndicator()
                is LockUiState.NoCredentialEnrolled -> {
                    Text(uiState.message)
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = onContinueWithoutBiometric) { Text(stringResource(R.string.lock_continue_button)) }
                }
                is LockUiState.Failed -> {
                    Text(uiState.message)
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = onRetry) { Text(stringResource(R.string.lock_retry_button)) }
                }
            }
        }
    }
}
