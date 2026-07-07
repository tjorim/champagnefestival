package be.champagnefestival.android.core.network

/** Tuning for [retryWithBackoff]'s delay between attempts. */
data class BackoffPolicy(
    val initialDelayMillis: Long = 500,
    val maxDelayMillis: Long = 30_000,
    val factor: Double = 2.0
)
