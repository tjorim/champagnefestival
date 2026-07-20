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

class EditionRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var repository: DefaultEditionRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val apiService =
            ApiServiceFactory.create(
                baseUrl = server.url("/").toString(),
                client = OkHttpClient()
            )
        repository = DefaultEditionRepository(apiService)
    }

    @After
    fun tearDown() {
        server.close()
    }

    @Test
    fun `getActiveEdition scopes the request to festival editions`() = runTest {
        server.enqueue(MockResponse.Builder().body(sampleEditionJson()).build())

        val result = repository.getActiveEdition()

        assertTrue(result.isSuccess)
        assertEquals("2026-march", result.getOrNull()?.id)

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/editions/active", request.url.encodedPath)
        assertEquals("festival", request.url.queryParameter("edition_type"))
    }

    private fun sampleEditionJson(): String =
        """
        {
          "id":"2026-march",
          "year":2026,
          "month":"march",
          "edition_type":"festival",
          "active":true,
          "events":[]
        }
        """.trimIndent()
}
