package be.champagnefestival.android.feature.edition

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import be.champagnefestival.android.data.model.EditionOut
import be.champagnefestival.android.ui.UiState
import be.champagnefestival.android.ui.components.ErrorContent
import be.champagnefestival.android.ui.components.LoadingContent

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActiveEditionScreen(
    viewModel: ActiveEditionViewModel,
    onOpenScan: () -> Unit,
    onOpenLookup: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Active edition") }) },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = false,
                    onClick = onOpenScan,
                    icon = { Icon(Icons.Default.QrCodeScanner, null) },
                    label = { Text("Scan") },
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onOpenLookup,
                    icon = { Icon(Icons.Default.Search, null) },
                    label = { Text("Lookup") },
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onOpenSettings,
                    icon = { Icon(Icons.Default.Settings, null) },
                    label = { Text("Settings") },
                )
            }
        },
    ) { padding ->
        when (val state = uiState) {
            UiState.Loading -> LoadingContent(modifier = Modifier.padding(padding))
            is UiState.Error ->
                ErrorContent(
                    message = state.message,
                    onRetry = viewModel::loadActiveEdition,
                    modifier = Modifier.padding(padding),
                )
            is UiState.Success -> EditionContent(edition = state.data, padding = padding)
        }
    }
}

@Composable
private fun EditionContent(
    edition: EditionOut,
    padding: PaddingValues,
) {
    LazyColumn(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${edition.month} ${edition.year}", style = MaterialTheme.typography.headlineSmall)
                    Text(edition.edition_type.replaceFirstChar(Char::titlecase), style = MaterialTheme.typography.bodyLarge)
                    Text(if (edition.active) "Currently active" else "Inactive", color = MaterialTheme.colorScheme.primary)
                }
            }
        }
        if (edition.events.isEmpty()) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = "No events are available for the active edition yet.",
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
        } else {
            items(edition.events, key = { it.id }) { event ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(event.title, style = MaterialTheme.typography.titleMedium)
                        Text(event.date)
                        Text("${event.start_time}${event.end_time?.let { end -> " - $end" } ?: ""}")
                        Text(event.category.replaceFirstChar(Char::titlecase), color = MaterialTheme.colorScheme.secondary)
                        if (event.description.isNotBlank()) {
                            Text(event.description, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }
    }
}
