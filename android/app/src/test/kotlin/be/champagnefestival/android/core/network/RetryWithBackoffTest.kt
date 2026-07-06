package be.champagnefestival.android.core.network

import java.io.IOException
import javax.net.ssl.SSLPeerUnverifiedException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class RetryWithBackoffTest {
    private val dispatcher = StandardTestDispatcher()

    @Test
    fun `retries transient IOException until it succeeds`() = runTest(dispatcher) {
        var attempts = 0
        val result =
            retryWithBackoff {
                attempts++
                if (attempts < 3) throw IOException("connection reset") else "ok"
            }

        assertEquals("ok", result)
        assertEquals(3, attempts)
    }

    @Test
    fun `gives up after maxAttempts and surfaces the last exception`() = runTest(dispatcher) {
        var attempts = 0
        try {
            retryWithBackoff(maxAttempts = 3) {
                attempts++
                throw IOException("connection reset")
            }
            fail("Expected IOException to be thrown")
        } catch (expected: IOException) {
            // expected once retries are exhausted
        }
        assertEquals(3, attempts)
    }

    @Test
    fun `does not retry certificate failures`() = runTest(dispatcher) {
        var attempts = 0
        try {
            retryWithBackoff {
                attempts++
                throw SSLPeerUnverifiedException("pin failure")
            }
            fail("Expected SSLPeerUnverifiedException to be thrown")
        } catch (expected: SSLPeerUnverifiedException) {
            // expected - certificate failures are not transient
        }
        assertEquals(1, attempts)
    }

    @Test
    fun `does not retry http error responses`() = runTest(dispatcher) {
        var attempts = 0
        try {
            retryWithBackoff {
                attempts++
                throw httpException(500)
            }
            fail("Expected HttpException to be thrown")
        } catch (expected: HttpException) {
            // expected - a 5xx is a real server response, not a connectivity blip
        }
        assertEquals(1, attempts)
    }

    private fun httpException(code: Int): HttpException = HttpException(
        Response.error<String>(code, "{}".toResponseBody("application/json".toMediaType()))
    )
}
