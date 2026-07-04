package be.champagnefestival.android.feature.registration

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import be.champagnefestival.android.ui.components.ErrorContent
import be.champagnefestival.android.ui.components.LoadingContent

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckInConfirmationScreen(
    id: String,
    token: String,
    viewModel: CheckInViewModel,
    onBack: () -> Unit,
    onDone: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(id, token) {
        viewModel.submitCheckIn(id = id, token = token)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Check-in result") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        when (val state = uiState) {
            CheckInUiState.Loading -> LoadingContent(modifier = Modifier.padding(padding))
            is CheckInUiState.Error ->
                ErrorContent(message = state.message, onRetry = {
                    viewModel.submitCheckIn(id, token)
                }, modifier = Modifier.padding(padding))
            CheckInUiState.Unauthorized ->
                ErrorContent(message = "The check-in token is no longer valid.", onRetry = {
                    viewModel.submitCheckIn(id, token)
                }, modifier = Modifier.padding(padding))
            is CheckInUiState.RegistrationLoaded -> LoadingContent(modifier = Modifier.padding(padding))
            is CheckInUiState.CheckInSuccess -> {
                val registration = state.registration
                Column(
                    modifier =
                    Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        imageVector = if (state.alreadyCheckedIn) Icons.Default.Warning else Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = if (state.alreadyCheckedIn) {
                            MaterialTheme.colorScheme.tertiary
                        } else {
                            MaterialTheme.colorScheme.primary
                        }
                    )
                    Text(
                        text = if (state.alreadyCheckedIn) "Already checked in" else "Check-in complete",
                        style = MaterialTheme.typography.headlineMedium,
                        modifier = Modifier.padding(top = 16.dp)
                    )
                    Text(registration.name, modifier = Modifier.padding(top = 8.dp))
                    Text(registration.event_title)
                    Text(
                        text = registration.checked_in_at ?: "Checked in just now",
                        modifier = Modifier.padding(top = 8.dp)
                    )
                    Button(onClick = onDone, modifier = Modifier.padding(top = 24.dp)) {
                        Text("Back to active edition")
                    }
                }
            }
        }
    }
}
