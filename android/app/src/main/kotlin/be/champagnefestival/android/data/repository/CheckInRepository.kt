package be.champagnefestival.android.data.repository

import be.champagnefestival.android.data.api.ChampagneApiService
import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.data.model.CheckInLookupRequest
import be.champagnefestival.android.data.model.CheckInOut
import be.champagnefestival.android.data.model.CheckInRequest
import retrofit2.HttpException
import java.io.IOException
import javax.net.ssl.SSLPeerUnverifiedException

interface CheckInRepository {
    suspend fun lookupRegistration(
        id: String,
        token: String,
    ): Result<CheckInGuestOut>

    suspend fun submitCheckIn(
        id: String,
        token: String,
    ): Result<CheckInOut>

    suspend fun searchRegistrations(
        query: String,
        eventId: String?,
        authToken: String,
    ): Result<List<CheckInGuestOut>>
}

class DefaultCheckInRepository(
    private val apiService: ChampagneApiService,
) : CheckInRepository {
    override suspend fun lookupRegistration(
        id: String,
        token: String,
    ): Result<CheckInGuestOut> = runApiCall { apiService.lookupCheckIn(id = id, body = CheckInLookupRequest(token)) }

    override suspend fun submitCheckIn(
        id: String,
        token: String,
    ): Result<CheckInOut> = runApiCall { apiService.submitCheckIn(id = id, body = CheckInRequest(token = token)) }

    override suspend fun searchRegistrations(
        query: String,
        eventId: String?,
        authToken: String,
    ): Result<List<CheckInGuestOut>> =
        runApiCall {
            apiService.searchRegistrations(
                auth = bearer(authToken),
                query = query.takeIf { it.isNotBlank() },
                eventId = eventId?.takeIf { it.isNotBlank() },
            )
        }

    private suspend fun <T> runApiCall(block: suspend () -> T): Result<T> =
        try {
            Result.success(block())
        } catch (exception: HttpException) {
            if (exception.code() == 401) {
                Result.failure(UnauthorizedException())
            } else {
                Result.failure(ApiException(exception.message(), exception))
            }
        } catch (exception: SSLPeerUnverifiedException) {
            Result.failure(
                ApiException("Secure connection to the server could not be verified. Please update the app.", exception),
            )
        } catch (exception: IOException) {
            Result.failure(ApiException("Unable to reach the server. Check your connection and try again.", exception))
        } catch (exception: Exception) {
            Result.failure(ApiException(exception.message ?: "Something went wrong.", exception))
        }
}

class ApiException(
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)

class UnauthorizedException : Exception("You are not authorized to perform this action.")

private fun bearer(token: String): String = "Bearer $token"
