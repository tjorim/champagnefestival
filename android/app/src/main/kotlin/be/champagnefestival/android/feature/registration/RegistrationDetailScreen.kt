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
import androidx.compose.ui.unit.dp
import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.ui.UiState
import be.champagnefestival.android.ui.components.ErrorContent
import be.champagnefestival.android.ui.components.LoadingContent

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegistrationDetailScreen(
    id: String,
    token: String,
    viewModel: RegistrationDetailViewModel,
    onBack: () -> Unit,
    onCheckIn: (String, String) -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(id, token) {
        viewModel.loadRegistration(id = id, token = token)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Registration details") },
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
            is UiState.Error ->
                ErrorContent(message = state.message, onRetry = {
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
private fun RegistrationContent(
    registration: CheckInGuestOut,
    modifier: Modifier = Modifier,
    onCheckIn: () -> Unit,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(registration.name, style = MaterialTheme.typography.headlineSmall)
                    Text(registration.event_title, style = MaterialTheme.typography.titleMedium)
                    Text("Table: ${registration.table_name ?: "Unassigned"}")
                    Text("Party size: ${registration.guest_count}")
                    Text("Status: ${registration.status.replaceFirstChar(Char::titlecase)}")
                    Text(if (registration.checked_in) "Checked in" else "Not checked in")
                    Text(if (registration.strap_issued) "Strap issued" else "Strap not issued")
                    if (registration.notes.isNotBlank()) {
                        Text("Notes: ${registration.notes}")
                    }
                    if (!registration.checked_in) {
                        Button(onClick = onCheckIn) {
                            Text("Check In")
                        }
                    }
                }
            }
        }
        if (registration.pre_orders.isEmpty()) {
            item {
                Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Text("No pre-orders for this guest.", modifier = Modifier.padding(16.dp))
                }
            }
        } else {
            item {
                Text(
                    text = "Pre-orders",
                    modifier = Modifier.padding(horizontal = 16.dp),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            items(registration.pre_orders, key = { it.product_id }) { item ->
                Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(item.name)
                        Text("Quantity: ${item.quantity}")
                        Text("Category: ${item.category}")
                        Text(if (item.delivered) "Delivery: Delivered" else "Delivery: Not delivered")
                    }
                }
            }
        }
    }
}
