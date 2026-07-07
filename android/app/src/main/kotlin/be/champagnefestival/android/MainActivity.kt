package be.champagnefestival.android

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.weight
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import be.champagnefestival.android.app.NavGraph
import be.champagnefestival.android.feature.lock.BiometricGate
import be.champagnefestival.android.ui.components.ConnectivityBanner
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
                    val isOnline by app.connectivityObserver.isOnline.collectAsStateWithLifecycle()
                    Column(modifier = Modifier.fillMaxSize()) {
                        if (!isOnline) {
                            ConnectivityBanner()
                        }
                        NavGraph(app = app, modifier = Modifier.weight(1f))
                    }
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
