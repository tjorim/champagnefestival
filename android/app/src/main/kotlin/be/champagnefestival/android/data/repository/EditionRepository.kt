package be.champagnefestival.android.data.repository

import be.champagnefestival.android.data.api.ChampagneApiService
import be.champagnefestival.android.data.model.EditionOut
import be.champagnefestival.android.data.model.EventSummary
import retrofit2.HttpException
import java.io.IOException

interface EditionRepository {
    suspend fun getActiveEdition(): Result<EditionOut>

    suspend fun getEvents(
        editionId: String?,
        authToken: String,
    ): Result<List<EventSummary>>
}

class DefaultEditionRepository(
    private val apiService: ChampagneApiService,
) : EditionRepository {
    override suspend fun getActiveEdition(): Result<EditionOut> = runApiCall { apiService.getActiveEdition() }

    override suspend fun getEvents(
        editionId: String?,
        authToken: String,
    ): Result<List<EventSummary>> =
        runApiCall {
            apiService.getEvents(auth = "Bearer $authToken", editionId = editionId)
        }

    private suspend fun <T> runApiCall(block: suspend () -> T): Result<T> =
        try {
            Result.success(block())
        } catch (exception: HttpException) {
            Result.failure(ApiException(exception.message(), exception))
        } catch (exception: IOException) {
            Result.failure(ApiException("Unable to reach the server. Check your connection and try again.", exception))
        } catch (exception: Exception) {
            Result.failure(ApiException(exception.message ?: "Something went wrong.", exception))
        }
}
