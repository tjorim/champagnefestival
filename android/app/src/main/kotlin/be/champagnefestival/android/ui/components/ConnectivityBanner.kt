package be.champagnefestival.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import be.champagnefestival.android.R

@Composable
fun ConnectivityBanner(modifier: Modifier = Modifier) {
    Text(
        text = stringResource(R.string.connectivity_offline_banner),
        modifier =
        modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.errorContainer)
            .padding(vertical = 8.dp, horizontal = 16.dp),
        color = MaterialTheme.colorScheme.onErrorContainer,
        textAlign = TextAlign.Center
    )
}
