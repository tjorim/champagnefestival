package be.champagnefestival.android.data.api

import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.data.model.CheckInLookupRequest
import be.champagnefestival.android.data.model.CheckInOut
import be.champagnefestival.android.data.model.CheckInRequest
import be.champagnefestival.android.data.model.EditionOut
import be.champagnefestival.android.data.model.EventCheckInStats
import be.champagnefestival.android.data.model.EventSummary
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ChampagneApiService {
    @GET("api/editions/active")
    suspend fun getActiveEdition(): EditionOut

    @GET("api/events")
    suspend fun getEvents(
        @Header("Authorization") auth: String,
        @Query("edition_id") editionId: String? = null
    ): List<EventSummary>

    @GET("api/events/checkin-stats")
    suspend fun getCheckInStats(
        @Header("Authorization") auth: String,
        @Query("edition_id") editionId: String? = null
    ): List<EventCheckInStats>

    @POST("api/check-in/{id}/lookup")
    suspend fun lookupCheckIn(@Path("id") id: String, @Body body: CheckInLookupRequest): CheckInGuestOut

    @POST("api/check-in/{id}")
    suspend fun submitCheckIn(@Path("id") id: String, @Body body: CheckInRequest): CheckInOut

    @GET("api/volunteer/registrations")
    suspend fun searchRegistrations(
        @Header("Authorization") auth: String,
        @Query("q") query: String?,
        @Query("event_id") eventId: String?
    ): List<CheckInGuestOut>
}
