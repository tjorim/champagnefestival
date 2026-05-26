package be.champagnefestival.android.feature.lookup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.ui.components.ErrorContent
import be.champagnefestival.android.ui.components.LoadingContent

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GuestLookupScreen(
    viewModel: GuestLookupViewModel,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    var query by remember { mutableStateOf("") }
    var eventId by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Guest lookup") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(
                value = query,
                onValueChange = {
                    query = it
                    viewModel.search(query = query, eventId = eventId)
                },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Search by guest name or table") },
                singleLine = true,
            )
            OutlinedTextField(
                value = eventId,
                onValueChange = {
                    eventId = it
                    if (query.isNotBlank() || eventId.isNotBlank()) {
                        viewModel.search(query = query, eventId = eventId)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Optional event ID filter") },
                singleLine = true,
            )
            when (val state = uiState) {
                GuestLookupUiState.Idle -> Text("Search for guests by name or filter by event ID.")
                GuestLookupUiState.Loading -> LoadingContent(modifier = Modifier.weight(1f))
                is GuestLookupUiState.Error -> ErrorContent(message = state.message, onRetry = { viewModel.search(query, eventId) }, modifier = Modifier.weight(1f))
                is GuestLookupUiState.Success -> LookupResults(registrations = state.registrations, padding = PaddingValues(vertical = 8.dp))
            }
        }
    }
}

@Composable
private fun LookupResults(
    registrations: List<CheckInGuestOut>,
    padding: PaddingValues,
) {
    if (registrations.isEmpty()) {
        Text("No registrations matched your search.")
        return
    }

    val checkedInCount = registrations.count { it.checked_in }
    val undeliveredItems = registrations.sumOf { registration ->
        registration.pre_orders.count { !it.delivered }
    }

    Card(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Event-day summary")
            Text("Guests in results: ${registrations.size}")
            Text("Checked in: $checkedInCount")
            Text("Undelivered items: $undeliveredItems")
        }
    }

    LazyColumn(contentPadding = padding, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(registrations, key = { it.id }) { registration ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(registration.name)
                    Text(registration.event_title)
                    Text("Table: ${registration.table_name ?: "Unassigned"}")
                    Text("Guests: ${registration.guest_count}")
                    Text(if (registration.checked_in) "Checked in" else "Pending check-in")
                    val pendingItems = registration.pre_orders.count { !it.delivered }
                    Text(if (pendingItems == 0) "All items delivered" else "Pending delivery items: $pendingItems")
                }
            }
        }
    }
}
