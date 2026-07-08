package be.champagnefestival.android.data.repository

import be.champagnefestival.android.data.api.ChampagneApiService
import be.champagnefestival.android.data.model.EditionOut
import be.champagnefestival.android.data.model.EventCheckInStats
import be.champagnefestival.android.data.model.EventSummary
import retrofit2.HttpException

interface EditionRepository {
    suspend fun getActiveEdition(): Result<EditionOut>

    suspend fun getEvents(editionId: String?, authToken: String): Result<List<EventSummary>>

    suspend fun getCheckInStats(editionId: String?, authToken: String): Result<List<EventCheckInStats>>
}

class DefaultEditionRepository(private val apiService: ChampagneApiService) : EditionRepository {
    override suspend fun getActiveEdition(): Result<EditionOut> =
        runApiCall(mapHttpException = ::mapActiveEditionException) { apiService.getActiveEdition() }

    override suspend fun getEvents(editionId: String?, authToken: String): Result<List<EventSummary>> = runApiCall {
        apiService.getEvents(auth = "Bearer $authToken", editionId = editionId)
    }

    override suspend fun getCheckInStats(editionId: String?, authToken: String): Result<List<EventCheckInStats>> =
        runApiCall {
            apiService.getCheckInStats(auth = "Bearer $authToken", editionId = editionId)
        }

    // The backend returns 404 when there's no current or upcoming edition, which is an expected,
    // non-error state (not a real server rejection) — distinguish it so the UI can show an
    // informational empty state instead of a generic "something went wrong" message.
    private fun mapActiveEditionException(exception: HttpException): Exception = if (exception.code() == 404) {
        ApiException(exception.message(), ApiErrorReason.NOT_FOUND, exception)
    } else {
        ApiException(exception.message(), ApiErrorReason.SERVER_ERROR, exception)
    }
}
