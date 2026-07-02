package be.champagnefestival.android.data.repository

import be.champagnefestival.android.data.api.ChampagneApiService
import be.champagnefestival.android.data.model.EditionOut
import be.champagnefestival.android.data.model.EventSummary

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
}
