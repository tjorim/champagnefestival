package be.champagnefestival.android.data.repository

import be.champagnefestival.android.core.network.ApiServiceFactory
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class CheckInNetworkRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var repository: DefaultCheckInRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val apiService =
            ApiServiceFactory.create(
                baseUrl = server.url("/").toString(),
                client = OkHttpClient()
            )
        repository = DefaultCheckInRepository(apiService)
    }

    @After
    fun tearDown() {
        server.close()
    }

    @Test
    fun `lookupRegistration posts token and decodes registration`() = runTest {
        server.enqueue(MockResponse.Builder().body(sampleRegistrationJson()).build())

        val result = repository.lookupRegistration("reg-1", "qr-token")

        assertTrue(result.isSuccess)
        assertEquals("Jane Doe", result.getOrNull()?.name)
        assertEquals(2, result.getOrNull()?.guest_count)

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/check-in/reg-1/lookup", request.url.encodedPath)
        assertEquals("{\"token\":\"qr-token\"}", request.body?.utf8())
    }

    @Test
    fun `searchRegistrations sends bearer auth and query filters`() = runTest {
        server.enqueue(MockResponse.Builder().body("[${sampleRegistrationJson()}]").build())

        val result =
            repository.searchRegistrations(
                query = "jane",
                eventId = "event-1",
                authToken = "access-token"
            )

        assertTrue(result.isSuccess)
        assertEquals(1, result.getOrNull()?.size)

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("Bearer access-token", request.headers["Authorization"])
        assertEquals("jane", request.url.queryParameter("q"))
        assertEquals("event-1", request.url.queryParameter("event_id"))
    }

    @Test
    fun `submitCheckIn maps server errors to repository failure`() = runTest {
        server.enqueue(
            MockResponse
                .Builder()
                .code(500)
                .body("{\"detail\":\"boom\"}")
                .build()
        )

        val result = repository.submitCheckIn("reg-1", "qr-token")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is ApiException)
    }

    private fun sampleRegistrationJson(): String =
        """
        {
          "id":"reg-1",
          "name":"Jane Doe",
          "event_id":"event-1",
          "event_title":"Friday Tasting",
          "guest_count":2,
          "status":"confirmed",
          "checked_in":false,
          "strap_issued":false
        }
        """.trimIndent()
}
