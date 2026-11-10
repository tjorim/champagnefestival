package be.champagnefestival.android.core.auth

import android.net.Uri
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkStatic
import java.io.IOException
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class OidcServiceConfigurationDiscoveryTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        mockkStatic(Uri::class)
        every { Uri.parse(any()) } answers {
            fakeUri(firstArg())
        }
    }

    private fun fakeUri(value: String): Uri {
        val uri = mockk<Uri>()
        every { uri.toString() } returns value
        return uri
    }

    @After
    fun tearDown() {
        unmockkStatic(Uri::class)
        server.close()
    }

    @Test
    fun `fetch calls API config endpoint and uses returned auth and token urls`() = runTest {
        server.enqueue(
            MockResponse
                .Builder()
                .body(
                    """
                        {
                          "issuer": "https://auth.example.test/realms/champagnefestival",
                          "authorization_url": "$realm/protocol/openid-connect/auth",
                          "token_url": "$realm/protocol/openid-connect/token",
                          "end_session_url": "$realm/protocol/openid-connect/logout"
                        }
                    """.trimIndent()
                ).build()
        )

        val config =
            OidcServiceConfigurationDiscovery(OkHttpClient())
                .fetch(server.url("/").toString())

        assertEquals("/api/auth/oidc-config", server.takeRequest().url.encodedPath)
        assertEquals(
            "$realm/protocol/openid-connect/auth",
            config.authorizationEndpoint.toString()
        )
        assertEquals(
            "$realm/protocol/openid-connect/token",
            config.tokenEndpoint.toString()
        )
        assertEquals(
            "$realm/protocol/openid-connect/logout",
            config.endSessionEndpoint.toString()
        )
    }

    @Test
    fun `fetch throws with bounded error snippet on non-2xx response`() = runTest {
        server.enqueue(
            MockResponse
                .Builder()
                .code(502)
                .body("x".repeat(5000))
                .build()
        )

        val exception =
            runCatching {
                OidcServiceConfigurationDiscovery(OkHttpClient())
                    .fetch(server.url("/").toString())
            }.exceptionOrNull()

        assertTrue(exception is IOException)
        assertTrue(exception!!.message!!.contains("HTTP 502"))
        assertTrue(exception.message!!.length < 1200)
    }

    private val realm = "https://auth.example.test/realms/champagnefestival"
    private val insecureRealm = "http://auth.example.test/realms/champagnefestival"

    private fun enqueueConfig(vararg overrides: Pair<String, String?>) {
        val fields =
            mutableMapOf<String, String?>(
                "issuer" to realm,
                "authorization_url" to "$realm/protocol/openid-connect/auth",
                "token_url" to "$realm/protocol/openid-connect/token"
            )
        overrides.forEach { (key, value) -> fields[key] = value }
        val json = fields.entries.joinToString(prefix = "{", postfix = "}") { (key, value) ->
            if (value == null) "\"$key\": null" else "\"$key\": \"$value\""
        }
        server.enqueue(MockResponse.Builder().body(json).build())
    }

    private fun fetchError(): Throwable? = runCatching {
        kotlinx.coroutines.runBlocking {
            OidcServiceConfigurationDiscovery(OkHttpClient()).fetch(server.url("/").toString())
        }
    }.exceptionOrNull()

    @Test
    fun `fetch rejects insecure or credentialed endpoint urls`() {
        listOf(
            "authorization_url" to "$insecureRealm/protocol/openid-connect/auth",
            "authorization_url" to "https://user:secret@auth.example.test/realms/champagnefestival/auth",
            "authorization_url" to "https://auth.example.test/auth?next=https://evil.example.test",
            "authorization_url" to "javascript:alert(1)",
            "token_url" to "$insecureRealm/protocol/openid-connect/token",
            "end_session_url" to "$insecureRealm/protocol/openid-connect/logout"
        ).forEach { override ->
            enqueueConfig(override)
            val exception = fetchError()
            assertTrue("$override should be rejected", exception is IOException)
        }
    }

    @Test
    fun `fetch rejects a token or end session endpoint on a different host`() {
        enqueueConfig("token_url" to "https://evil.example.test/token")
        assertTrue(fetchError() is IOException)

        enqueueConfig("end_session_url" to "https://evil.example.test/logout")
        assertTrue(fetchError() is IOException)
    }

    @Test
    fun `fetch allows cleartext only on development hosts`() = runTest {
        enqueueConfig(
            "authorization_url" to "http://10.0.2.2:8080/realms/champagnefestival/protocol/openid-connect/auth",
            "token_url" to "http://10.0.2.2:8080/realms/champagnefestival/protocol/openid-connect/token"
        )

        val config = OidcServiceConfigurationDiscovery(OkHttpClient()).fetch(server.url("/").toString())

        assertEquals(
            "http://10.0.2.2:8080/realms/champagnefestival/protocol/openid-connect/token",
            config.tokenEndpoint.toString()
        )
    }

    @Test
    fun `fetch does not follow redirects`() {
        server.enqueue(
            MockResponse.Builder().code(302).addHeader("Location", server.url("/elsewhere").toString()).build()
        )
        server.enqueue(MockResponse.Builder().body("{}").build())

        val exception = fetchError()

        assertTrue(exception is IOException)
        assertTrue(exception!!.message!!.contains("HTTP 302"))
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `fetch rejects an oversized config response`() {
        server.enqueue(MockResponse.Builder().body("{\"padding\": \"" + "x".repeat(70_000) + "\"}").build())

        val exception = fetchError()

        assertTrue(exception is IOException)
        assertTrue(exception!!.message!!.contains("too large"))
    }
}
