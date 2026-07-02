package be.champagnefestival.android.core.network

import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DynamicBaseUrlInterceptorTest {
    private lateinit var defaultServer: MockWebServer
    private lateinit var overrideServer: MockWebServer

    @Before
    fun setUp() {
        defaultServer = MockWebServer()
        defaultServer.start()
        overrideServer = MockWebServer()
        overrideServer.start()
    }

    @After
    fun tearDown() {
        defaultServer.close()
        overrideServer.close()
    }

    private fun client(baseUrlProvider: () -> String?): OkHttpClient =
        OkHttpClient
            .Builder()
            .addInterceptor(DynamicBaseUrlInterceptor(baseUrlProvider))
            .build()

    private fun requestAgainstDefaultServer(): Request =
        Request
            .Builder()
            .url(defaultServer.url("/api/settings?user=1"))
            .build()

    @Test
    fun `request goes to the default server when the provider returns the default URL`() {
        defaultServer.enqueue(MockResponse.Builder().body("{}").build())

        client { defaultServer.url("/").toString() }.newCall(requestAgainstDefaultServer()).execute().use { response ->
            assertTrue(response.isSuccessful)
        }

        assertEquals(1, defaultServer.requestCount)
        assertEquals(0, overrideServer.requestCount)
        assertEquals("/api/settings?user=1", defaultServer.takeRequest().url.encodedPathAndQueryOrPath())
    }

    @Test
    fun `request is rewritten to the override scheme, host, and port`() {
        overrideServer.enqueue(MockResponse.Builder().body("{}").build())

        client { overrideServer.url("/").toString() }.newCall(requestAgainstDefaultServer()).execute().use { response ->
            assertTrue(response.isSuccessful)
        }

        assertEquals(0, defaultServer.requestCount)
        assertEquals(1, overrideServer.requestCount)
        val received = overrideServer.takeRequest()
        assertEquals(overrideServer.url("/").host, received.url.host)
        assertEquals(overrideServer.url("/").port, received.url.port)
        assertEquals("/api/settings?user=1", received.url.encodedPathAndQueryOrPath())
    }

    @Test
    fun `null provider value leaves the request untouched`() {
        defaultServer.enqueue(MockResponse.Builder().body("{}").build())

        client { null }.newCall(requestAgainstDefaultServer()).execute().use { response ->
            assertTrue(response.isSuccessful)
        }

        assertEquals(1, defaultServer.requestCount)
        assertEquals(0, overrideServer.requestCount)
    }

    @Test
    fun `invalid provider value leaves the request untouched`() {
        defaultServer.enqueue(MockResponse.Builder().body("{}").build())

        client { "not a url" }.newCall(requestAgainstDefaultServer()).execute().use { response ->
            assertTrue(response.isSuccessful)
        }

        assertEquals(1, defaultServer.requestCount)
        assertEquals(0, overrideServer.requestCount)
    }

    @Test
    fun `provider value is read fresh on every request, so a change takes effect immediately`() {
        var currentBaseUrl = overrideServer.url("/").toString()
        val client = client { currentBaseUrl }

        overrideServer.enqueue(MockResponse.Builder().body("{}").build())
        client.newCall(requestAgainstDefaultServer()).execute().close()
        assertEquals(1, overrideServer.requestCount)

        currentBaseUrl = defaultServer.url("/").toString()
        defaultServer.enqueue(MockResponse.Builder().body("{}").build())
        client.newCall(requestAgainstDefaultServer()).execute().close()
        assertEquals(1, defaultServer.requestCount)
        assertEquals(1, overrideServer.requestCount)
    }

    @Test
    fun `isValidOverride accepts http urls and rejects garbage`() {
        assertTrue(DynamicBaseUrlInterceptor.isValidOverride("http://10.0.2.2:8000/"))
        assertTrue(DynamicBaseUrlInterceptor.isValidOverride("https://staging.champagnefestival.example"))
        assertFalse(DynamicBaseUrlInterceptor.isValidOverride("not a url"))
        assertFalse(DynamicBaseUrlInterceptor.isValidOverride(""))
    }

    private fun okhttp3.HttpUrl.encodedPathAndQueryOrPath(): String = encodedQuery?.let { "$encodedPath?$it" } ?: encodedPath
}
