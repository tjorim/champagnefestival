package be.champagnefestival.android.core.session

/**
 * Pure decision logic for whether returning to the foreground should require
 * re-authentication, kept independent of BiometricPrompt/Android framework
 * classes so it can be unit tested without a device or Robolectric.
 */
object IdleLockPolicy {
    const val DEFAULT_IDLE_TIMEOUT_MILLIS = 5 * 60 * 1000L

    /**
     * @param lastBackgroundedAtMillis timestamp of the most recent backgrounding since the
     * app was last unlocked, or null if it hasn't been backgrounded since then.
     */
    fun shouldRequireUnlock(
        lockEnabled: Boolean,
        lastBackgroundedAtMillis: Long?,
        nowMillis: Long,
        idleTimeoutMillis: Long = DEFAULT_IDLE_TIMEOUT_MILLIS,
    ): Boolean {
        if (!lockEnabled || lastBackgroundedAtMillis == null) return false
        return nowMillis - lastBackgroundedAtMillis >= idleTimeoutMillis
    }
}
