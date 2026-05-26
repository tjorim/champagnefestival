package be.champagnefestival.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.lifecycleScope
import be.champagnefestival.android.app.NavGraph
import be.champagnefestival.android.ui.theme.ChampagneFestivalTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val app: ChampagneFestivalApp
        get() = application as ChampagneFestivalApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleScope.launch {
            app.authManager.handleAuthResponse(intent)
        }
        setContent {
            ChampagneFestivalTheme {
                NavGraph(app = app)
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        lifecycleScope.launch {
            app.authManager.handleAuthResponse(intent)
        }
    }
}
