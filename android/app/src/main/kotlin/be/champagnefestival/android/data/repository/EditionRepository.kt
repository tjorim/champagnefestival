package be.champagnefestival.android.data.repository

import be.champagnefestival.android.data.api.ChampagneApiService
import be.champagnefestival.android.data.model.EditionOut
import be.champagnefestival.android.data.model.EventCheckInStats
import be.champagnefestival.android.data.model.EventSummary

interface EditionRepository {
    suspend fun getActiveEdition(): Result<EditionOut>

    suspend fun getEvents(editionId: String?, authToken: String): Result<List<EventSummary>>

    suspend fun getCheckInStats(editionId: String?, authToken: String): Result<List<EventCheckInStats>>
}

class DefaultEditionRepository(private val apiService: ChampagneApiService) : EditionRepository {
    override suspend fun getActiveEdition(): Result<EditionOut> = runApiCall { apiService.getActiveEdition() }

    override suspend fun getEvents(editionId: String?, authToken: String): Result<List<EventSummary>> = runApiCall {
        apiService.getEvents(auth = "Bearer $authToken", editionId = editionId)
    }

    override suspend fun getCheckInStats(editionId: String?, authToken: String): Result<List<EventCheckInStats>> =
        runApiCall {
            apiService.getCheckInStats(auth = "Bearer $authToken", editionId = editionId)
        }
}
