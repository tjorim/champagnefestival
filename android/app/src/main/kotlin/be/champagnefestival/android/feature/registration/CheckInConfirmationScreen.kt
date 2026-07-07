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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import be.champagnefestival.android.R
import be.champagnefestival.android.data.repository.ApiErrorReason
import be.champagnefestival.android.ui.components.ErrorContent
import be.champagnefestival.android.ui.components.LoadingContent
import be.champagnefestival.android.ui.components.toStringRes

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
                title = { Text(stringResource(R.string.checkin_result_title)) },
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
            CheckInUiState.Loading -> LoadingContent(modifier = Modifier.padding(padding))
            is CheckInUiState.Error ->
                ErrorContent(message = stringResource(state.reason.toStringRes()), onRetry = {
                    viewModel.submitCheckIn(id, token)
                }, modifier = Modifier.padding(padding))
            CheckInUiState.Unauthorized ->
                ErrorContent(message = stringResource(ApiErrorReason.UNAUTHORIZED.toStringRes()), onRetry = {
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
                        text = if (state.alreadyCheckedIn) {
                            stringResource(R.string.checkin_already_in_title)
                        } else {
                            stringResource(R.string.checkin_complete_title)
                        },
                        style = MaterialTheme.typography.headlineMedium,
                        modifier = Modifier.padding(top = 16.dp)
                    )
                    Text(registration.name, modifier = Modifier.padding(top = 8.dp))
                    Text(registration.event_title)
                    Text(
                        text = registration.checked_in_at ?: stringResource(R.string.checkin_just_now_fallback),
                        modifier = Modifier.padding(top = 8.dp)
                    )
                    Button(onClick = onDone, modifier = Modifier.padding(top = 24.dp)) {
                        Text(stringResource(R.string.checkin_back_to_edition_button))
                    }
                }
            }
        }
    }
}
