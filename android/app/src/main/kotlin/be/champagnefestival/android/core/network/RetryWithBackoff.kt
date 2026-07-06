package be.champagnefestival.android.core.network

import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLPeerUnverifiedException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/**
 * Retries [block] on transient connectivity failures only (dropped connections, timeouts,
 * DNS blips). A certificate failure won't be fixed by retrying, and an HTTP error response
 * (including 5xx) is a real answer from the server, not a blip - both are surfaced
 * immediately instead of being retried.
 */
suspend fun <T> retryWithBackoff(
    maxAttempts: Int = 3,
    initialDelayMillis: Long = 500,
    factor: Double = 2.0,
    shouldRetry: (Throwable) -> Boolean = ::isTransientNetworkFailure,
    block: suspend () -> T
): T {
    var attempt = 0
    var delayMillis = initialDelayMillis
    while (true) {
        try {
            return block()
        } catch (exception: CancellationException) {
            throw exception
        } catch (exception: Throwable) {
            attempt++
            if (attempt >= maxAttempts || !shouldRetry(exception)) {
                throw exception
            }
            delay(delayMillis)
            delayMillis = (delayMillis * factor).toLong()
        }
    }
}

fun isTransientNetworkFailure(throwable: Throwable): Boolean = when (throwable) {
    is SSLPeerUnverifiedException -> false
    is SocketTimeoutException, is UnknownHostException, is ConnectException -> true
    is IOException -> true
    else -> false
}
