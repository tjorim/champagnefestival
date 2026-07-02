package be.champagnefestival.android.data.repository

import retrofit2.HttpException
import java.io.IOException
import javax.net.ssl.SSLPeerUnverifiedException

class ApiException(
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)

class UnauthorizedException : Exception("You are not authorized to perform this action.")

suspend fun <T> runApiCall(
    mapHttpException: (HttpException) -> Exception = { ApiException(it.message(), it) },
    block: suspend () -> T,
): Result<T> =
    try {
        Result.success(block())
    } catch (exception: HttpException) {
        Result.failure(mapHttpException(exception))
    } catch (exception: SSLPeerUnverifiedException) {
        Result.failure(
            ApiException("The server's certificate could not be verified. Please update the app.", exception),
        )
    } catch (exception: IOException) {
        Result.failure(ApiException("Unable to reach the server. Check your connection and try again.", exception))
    } catch (exception: Exception) {
        Result.failure(ApiException(exception.message ?: "Something went wrong.", exception))
    }
