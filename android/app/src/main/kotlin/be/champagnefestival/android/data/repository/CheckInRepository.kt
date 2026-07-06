package be.champagnefestival.android.data.repository

import be.champagnefestival.android.data.api.ChampagneApiService
import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.data.model.CheckInLookupRequest
import be.champagnefestival.android.data.model.CheckInOut
import be.champagnefestival.android.data.model.CheckInRequest
import retrofit2.HttpException

interface CheckInRepository {
    suspend fun lookupRegistration(id: String, token: String): Result<CheckInGuestOut>

    suspend fun submitCheckIn(id: String, token: String): Result<CheckInOut>

    suspend fun searchRegistrations(query: String, eventId: String?, authToken: String): Result<List<CheckInGuestOut>>
}

class DefaultCheckInRepository(private val apiService: ChampagneApiService) : CheckInRepository {
    override suspend fun lookupRegistration(id: String, token: String): Result<CheckInGuestOut> =
        runApiCall(mapHttpException = ::mapAuthAwareException) {
            apiService.lookupCheckIn(id = id, body = CheckInLookupRequest(token))
        }

    override suspend fun submitCheckIn(id: String, token: String): Result<CheckInOut> =
        runApiCall(mapHttpException = ::mapAuthAwareException) {
            apiService.submitCheckIn(id = id, body = CheckInRequest(token = token))
        }

    override suspend fun searchRegistrations(
        query: String,
        eventId: String?,
        authToken: String
    ): Result<List<CheckInGuestOut>> = runApiCall(mapHttpException = ::mapAuthAwareException) {
        apiService.searchRegistrations(
            auth = bearer(authToken),
            query = query.takeIf { it.isNotBlank() },
            eventId = eventId?.takeIf { it.isNotBlank() }
        )
    }

    private fun mapAuthAwareException(exception: HttpException): Exception =
        if (exception.code() == 401) {
            UnauthorizedException()
        } else {
            ApiException(exception.message(), ApiErrorReason.SERVER_ERROR, exception)
        }
}

private fun bearer(token: String): String = "Bearer $token"
