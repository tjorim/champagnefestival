package be.champagnefestival.android.data.repository

import be.champagnefestival.android.core.network.retryWithBackoff
import java.io.IOException
import javax.net.ssl.SSLPeerUnverifiedException
import kotlinx.coroutines.CancellationException
import retrofit2.HttpException

enum class ApiErrorReason {
    NETWORK_UNAVAILABLE,
    CERTIFICATE_UNTRUSTED,
    UNAUTHORIZED,
    NOT_FOUND,
    SERVER_ERROR,
    UNKNOWN
}

class ApiException(message: String, val reason: ApiErrorReason, cause: Throwable? = null) : Exception(message, cause)

class UnauthorizedException : Exception("You are not authorized to perform this action.")

/**
 * Classifies any failure surfaced by a repository call, whether it was wrapped by
 * [runApiCall] into an [ApiException] or bubbled up unwrapped (e.g. from [AuthManager]'s
 * OIDC calls), so UI layers can map it to a localized message without inspecting raw
 * exception messages.
 */
fun Throwable.toApiErrorReason(): ApiErrorReason = when (this) {
    is UnauthorizedException -> ApiErrorReason.UNAUTHORIZED
    is ApiException -> reason
    is SSLPeerUnverifiedException -> ApiErrorReason.CERTIFICATE_UNTRUSTED
    is IOException -> ApiErrorReason.NETWORK_UNAVAILABLE
    else -> ApiErrorReason.UNKNOWN
}

suspend fun <T> runApiCall(
    mapHttpException: (HttpException) -> Exception = {
        ApiException(it.message(), ApiErrorReason.SERVER_ERROR, it)
    },
    block: suspend () -> T
): Result<T> = try {
    Result.success(retryWithBackoff { block() })
} catch (exception: HttpException) {
    Result.failure(mapHttpException(exception))
} catch (exception: SSLPeerUnverifiedException) {
    Result.failure(
        ApiException(
            "The server's certificate could not be verified. Please update the app.",
            ApiErrorReason.CERTIFICATE_UNTRUSTED,
            exception
        )
    )
} catch (exception: IOException) {
    Result.failure(
        ApiException(
            "Unable to reach the server. Check your connection and try again.",
            ApiErrorReason.NETWORK_UNAVAILABLE,
            exception
        )
    )
} catch (exception: CancellationException) {
    throw exception
} catch (exception: Exception) {
    Result.failure(ApiException(exception.message ?: "Something went wrong.", ApiErrorReason.UNKNOWN, exception))
}
