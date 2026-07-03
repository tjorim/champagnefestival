package be.champagnefestival.android.core.auth

import android.net.Uri
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkStatic
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
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
            val value = firstArg<String>()
            mockk<Uri> { every { toString() } returns value }
        }
    }

    @After
    fun tearDown() {
        unmockkStatic(Uri::class)
        server.close()
    }

    @Test
    fun `fetch calls API config endpoint and uses returned auth and token urls`() =
        runTest {
            server.enqueue(
                MockResponse
                    .Builder()
                    .body(
                        """
                        {
                          "issuer": "https://auth.example.test/realms/champagnefestival",
                          "authorization_url": "https://auth.example.test/realms/champagnefestival/protocol/openid-connect/auth",
                          "token_url": "https://auth.example.test/realms/champagnefestival/protocol/openid-connect/token"
                        }
                        """.trimIndent(),
                    ).build(),
            )

            val config = OidcServiceConfigurationDiscovery(OkHttpClient()).fetch(server.url("/").toString())

            assertEquals("/api/auth/oidc-config", server.takeRequest().url.encodedPath)
            assertEquals(
                "https://auth.example.test/realms/champagnefestival/protocol/openid-connect/auth",
                config.authorizationEndpoint.toString(),
            )
            assertEquals(
                "https://auth.example.test/realms/champagnefestival/protocol/openid-connect/token",
                config.tokenEndpoint.toString(),
            )
        }
}
