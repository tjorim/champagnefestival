package be.champagnefestival.android.core.session

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class IdleLockPolicyTest {
    @Test
    fun `does not require unlock when lock is disabled`() {
        assertFalse(
            IdleLockPolicy.shouldRequireUnlock(
                lockEnabled = false,
                lastBackgroundedAtMillis = 0L,
                nowMillis = IdleLockPolicy.DEFAULT_IDLE_TIMEOUT_MILLIS * 10
            )
        )
    }

    @Test
    fun `does not require unlock when never backgrounded`() {
        assertFalse(
            IdleLockPolicy.shouldRequireUnlock(
                lockEnabled = true,
                lastBackgroundedAtMillis = null,
                nowMillis = IdleLockPolicy.DEFAULT_IDLE_TIMEOUT_MILLIS * 10
            )
        )
    }

    @Test
    fun `does not require unlock before the idle timeout elapses`() {
        val idleTimeoutMillis = 60_000L
        assertFalse(
            IdleLockPolicy.shouldRequireUnlock(
                lockEnabled = true,
                lastBackgroundedAtMillis = 1_000L,
                nowMillis = 1_000L + idleTimeoutMillis - 1,
                idleTimeoutMillis = idleTimeoutMillis
            )
        )
    }

    @Test
    fun `requires unlock once the idle timeout has elapsed`() {
        val idleTimeoutMillis = 60_000L
        assertTrue(
            IdleLockPolicy.shouldRequireUnlock(
                lockEnabled = true,
                lastBackgroundedAtMillis = 1_000L,
                nowMillis = 1_000L + idleTimeoutMillis,
                idleTimeoutMillis = idleTimeoutMillis
            )
        )
    }

    @Test
    fun `requires unlock well past the idle timeout`() {
        assertTrue(
            IdleLockPolicy.shouldRequireUnlock(
                lockEnabled = true,
                lastBackgroundedAtMillis = 0L,
                nowMillis = IdleLockPolicy.DEFAULT_IDLE_TIMEOUT_MILLIS * 10
            )
        )
    }
}
