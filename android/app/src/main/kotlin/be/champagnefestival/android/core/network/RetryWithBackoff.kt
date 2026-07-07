package be.champagnefestival.android.core.network

import java.net.ConnectException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/** Tuning for [retryWithBackoff]'s delay between attempts. */
data class BackoffPolicy(
    val initialDelayMillis: Long = 500,
    val maxDelayMillis: Long = 30_000,
    val factor: Double = 2.0
)

/**
 * Retries [block] on transient connectivity failures only (dropped connections, timeouts,
 * DNS blips). A certificate failure won't be fixed by retrying, and an HTTP error response
 * (including 5xx) is a real answer from the server, not a blip - both are surfaced
 * immediately instead of being retried. Other IOExceptions (e.g. response parsing failures)
 * aren't retried either, since retrying them can't succeed and only delays the failure.
 */
suspend fun <T> retryWithBackoff(
    maxAttempts: Int = 3,
    backoffPolicy: BackoffPolicy = BackoffPolicy(),
    shouldRetry: (Throwable) -> Boolean = ::isTransientNetworkFailure,
    block: suspend () -> T
): T {
    var attempt = 0
    var delayMillis = backoffPolicy.initialDelayMillis
    while (true) {
        try {
            return block()
        } catch (exception: CancellationException) {
            throw exception
        } catch (exception: Exception) {
            attempt++
            if (attempt >= maxAttempts || !shouldRetry(exception)) {
                throw exception
            }
            delay(delayMillis)
            delayMillis = (delayMillis * backoffPolicy.factor).toLong().coerceAtMost(backoffPolicy.maxDelayMillis)
        }
    }
}

fun isTransientNetworkFailure(throwable: Throwable): Boolean = when (throwable) {
    is SocketTimeoutException, is UnknownHostException, is ConnectException, is SocketException -> true
    else -> false
}
