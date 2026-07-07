package be.champagnefestival.android.feature.registration

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import be.champagnefestival.android.R
import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.ui.UiState
import be.champagnefestival.android.ui.components.ErrorContent
import be.champagnefestival.android.ui.components.LoadingContent
import be.champagnefestival.android.ui.components.toStringRes

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegistrationDetailScreen(
    id: String,
    token: String,
    viewModel: RegistrationDetailViewModel,
    onBack: () -> Unit,
    onCheckIn: (String, String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(id, token) {
        viewModel.loadRegistration(id = id, token = token)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.registration_detail_title)) },
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
            is UiState.Error ->
                ErrorContent(message = stringResource(state.reason.toStringRes()), onRetry = {
                    viewModel.loadRegistration(id, token)
                }, modifier = Modifier.padding(padding))
            is UiState.Success ->
                RegistrationContent(registration = state.data, modifier = Modifier.padding(padding), onCheckIn = {
                    onCheckIn(id, token)
                })
        }
    }
}

@Composable
private fun RegistrationContent(registration: CheckInGuestOut, modifier: Modifier = Modifier, onCheckIn: () -> Unit) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(registration.name, style = MaterialTheme.typography.headlineSmall)
                    Text(registration.event_title, style = MaterialTheme.typography.titleMedium)
                    Text(
                        stringResource(
                            R.string.registration_table_format,
                            registration.table_name ?: stringResource(R.string.registration_table_unassigned)
                        )
                    )
                    Text(stringResource(R.string.registration_party_size_format, registration.guest_count))
                    Text(
                        stringResource(
                            R.string.registration_status_format,
                            registration.status.replaceFirstChar(Char::titlecase)
                        )
                    )
                    Text(
                        if (registration.checked_in) {
                            stringResource(R.string.registration_checked_in_label)
                        } else {
                            stringResource(R.string.registration_not_checked_in_label)
                        }
                    )
                    Text(
                        if (registration.strap_issued) {
                            stringResource(R.string.registration_strap_issued_label)
                        } else {
                            stringResource(R.string.registration_strap_not_issued_label)
                        }
                    )
                    if (registration.notes.isNotBlank()) {
                        Text(stringResource(R.string.registration_notes_format, registration.notes))
                    }
                    if (!registration.checked_in) {
                        Button(onClick = onCheckIn) {
                            Text(stringResource(R.string.registration_check_in_button))
                        }
                    }
                }
            }
        }
        if (registration.pre_orders.isEmpty()) {
            item {
                Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Text(stringResource(R.string.registration_no_preorders), modifier = Modifier.padding(16.dp))
                }
            }
        } else {
            item {
                Text(
                    text = stringResource(R.string.registration_preorders_title),
                    modifier = Modifier.padding(horizontal = 16.dp),
                    style = MaterialTheme.typography.titleMedium
                )
            }
            items(registration.pre_orders, key = { it.product_id }) { item ->
                Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(item.name)
                        Text(stringResource(R.string.registration_preorder_quantity_format, item.quantity))
                        Text(stringResource(R.string.registration_preorder_category_format, item.category))
                        Text(
                            if (item.delivered) {
                                stringResource(R.string.registration_preorder_delivered_label)
                            } else {
                                stringResource(R.string.registration_preorder_not_delivered_label)
                            }
                        )
                    }
                }
            }
        }
    }
}
