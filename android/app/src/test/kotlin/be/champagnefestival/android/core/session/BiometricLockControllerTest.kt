package be.champagnefestival.android.core.session

import androidx.lifecycle.LifecycleOwner
import be.champagnefestival.android.core.storage.BiometricLockPreferencesStore
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BiometricLockControllerTest {
    private val lockEnabledFlow = MutableStateFlow<Boolean?>(true)
    private val biometricLockPreferencesStore =
        mockk<BiometricLockPreferencesStore> {
            every { biometricLockEnabledFlow } returns lockEnabledFlow
        }
    private val owner = mockk<LifecycleOwner>()

    @Test
    fun `is locked at process start`() {
        val controller = BiometricLockController(biometricLockPreferencesStore)

        assertTrue(controller.isLocked.value)
    }

    @Test
    fun `stays unlocked on resume before the idle timeout elapses`() {
        var now = 0L
        val controller =
            BiometricLockController(biometricLockPreferencesStore, idleTimeoutMillis = 60_000L, clock = { now })
        controller.markUnlocked()

        controller.onStop(owner)
        now += 30_000L
        controller.onStart(owner)

        assertFalse(controller.isLocked.value)
    }

    @Test
    fun `re-locks on resume after the idle timeout elapses`() {
        var now = 0L
        val controller =
            BiometricLockController(biometricLockPreferencesStore, idleTimeoutMillis = 60_000L, clock = { now })
        controller.markUnlocked()

        controller.onStop(owner)
        now += 60_000L
        controller.onStart(owner)

        assertTrue(controller.isLocked.value)
    }

    @Test
    fun `does not re-lock when the setting is disabled`() {
        lockEnabledFlow.value = false
        var now = 0L
        val controller =
            BiometricLockController(biometricLockPreferencesStore, idleTimeoutMillis = 60_000L, clock = { now })
        controller.markUnlocked()

        controller.onStop(owner)
        now += 120_000L
        controller.onStart(owner)

        assertFalse(controller.isLocked.value)
    }

    @Test
    fun `re-locks on resume when the setting has not loaded yet`() {
        lockEnabledFlow.value = null
        var now = 0L
        val controller =
            BiometricLockController(biometricLockPreferencesStore, idleTimeoutMillis = 60_000L, clock = { now })
        controller.markUnlocked()

        controller.onStop(owner)
        now += 60_000L
        controller.onStart(owner)

        assertTrue(controller.isLocked.value)
    }

    @Test
    fun `markUnlocked resets the backgrounded timestamp`() {
        var now = 0L
        val controller =
            BiometricLockController(biometricLockPreferencesStore, idleTimeoutMillis = 60_000L, clock = { now })
        controller.markUnlocked()
        controller.onStop(owner)
        now += 120_000L
        controller.onStart(owner)
        assertTrue(controller.isLocked.value)

        controller.markUnlocked()
        controller.onStop(owner)
        now += 30_000L
        controller.onStart(owner)

        assertFalse(controller.isLocked.value)
    }
}
