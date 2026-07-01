package be.champagnefestival.android.core.session

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import be.champagnefestival.android.core.storage.SessionDataStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * App-wide lock state, driven by [ProcessLifecycleOwner][androidx.lifecycle.ProcessLifecycleOwner]
 * background/foreground transitions. Locked by default at process start so cached guest
 * PII is never shown before the gate has confirmed the current lock setting.
 */
class BiometricLockController(
    sessionDataStore: SessionDataStore,
    private val idleTimeoutMillis: Long = IdleLockPolicy.DEFAULT_IDLE_TIMEOUT_MILLIS,
    private val clock: () -> Long = System::currentTimeMillis,
) : DefaultLifecycleObserver {
    val lockEnabledFlow: StateFlow<Boolean?> = sessionDataStore.biometricLockEnabledFlow

    private val _isLocked = MutableStateFlow(true)
    val isLocked: StateFlow<Boolean> = _isLocked.asStateFlow()

    private var lastBackgroundedAtMillis: Long? = null

    override fun onStop(owner: LifecycleOwner) {
        lastBackgroundedAtMillis = clock()
    }

    override fun onStart(owner: LifecycleOwner) {
        if (
            IdleLockPolicy.shouldRequireUnlock(
                // Fail secure if the setting hasn't loaded from DataStore yet.
                lockEnabled = lockEnabledFlow.value ?: true,
                lastBackgroundedAtMillis = lastBackgroundedAtMillis,
                nowMillis = clock(),
                idleTimeoutMillis = idleTimeoutMillis,
            )
        ) {
            _isLocked.value = true
        }
    }

    fun markUnlocked() {
        _isLocked.value = false
        lastBackgroundedAtMillis = null
    }
}
