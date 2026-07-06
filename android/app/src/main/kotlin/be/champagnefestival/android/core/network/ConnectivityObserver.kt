package be.champagnefestival.android.core.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Tracks whether the device currently has validated internet access, so the UI can show a
 * connectivity banner immediately rather than only after an action fails.
 */
@Singleton
class ConnectivityObserver
@Inject
constructor(@ApplicationContext context: Context) {
    private val connectivityManager = context.getSystemService(ConnectivityManager::class.java)

    private val _isOnline = MutableStateFlow(hasValidatedInternet())
    val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()

    private val networkCallback =
        object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                _isOnline.value = hasValidatedInternet()
            }

            override fun onLost(network: Network) {
                _isOnline.value = hasValidatedInternet()
            }

            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                _isOnline.value = hasValidatedInternet()
            }
        }

    init {
        val request =
            NetworkRequest
                .Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
        connectivityManager?.registerNetworkCallback(request, networkCallback)
    }

    private fun hasValidatedInternet(): Boolean {
        val network = connectivityManager?.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
