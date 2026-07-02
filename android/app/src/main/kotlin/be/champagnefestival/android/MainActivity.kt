package be.champagnefestival.android

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import be.champagnefestival.android.app.NavGraph
import be.champagnefestival.android.feature.lock.BiometricGate
import be.champagnefestival.android.ui.theme.ChampagneFestivalTheme
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
    private val app: ChampagneFestivalApp
        get() = application as ChampagneFestivalApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleScope.launch {
            app.authManager.handleAuthResponse(intent)
        }
        setContent {
            ChampagneFestivalTheme {
                BiometricGate(app = app) {
                    NavGraph(app = app)
                }
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
