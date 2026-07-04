package be.champagnefestival.android.data.repository

import be.champagnefestival.android.data.api.ChampagneApiService
import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.data.model.CheckInOut
import io.mockk.coEvery
import io.mockk.mockk
import javax.net.ssl.SSLPeerUnverifiedException
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class CheckInRepositoryTest {
    private val apiService = mockk<ChampagneApiService>()
    private val repository = DefaultCheckInRepository(apiService)

    @Test
    fun `lookupRegistration returns success`() = runTest {
        val registration = sampleRegistration()
        coEvery { apiService.lookupCheckIn("reg-1", any()) } returns registration

        val result = repository.lookupRegistration("reg-1", "token")

        assertTrue(result.isSuccess)
        assertEquals(registration, result.getOrNull())
    }

    @Test
    fun `lookupRegistration returns failure on api error`() = runTest {
        coEvery { apiService.lookupCheckIn("reg-1", any()) } throws httpException(500)

        val result = repository.lookupRegistration("reg-1", "token")

        assertTrue(result.isFailure)
    }

    @Test
    fun `lookupRegistration distinguishes certificate pin failures from generic connectivity errors`() = runTest {
        coEvery { apiService.lookupCheckIn("reg-1", any()) } throws SSLPeerUnverifiedException("pin failure")

        val result = repository.lookupRegistration("reg-1", "token")

        assertTrue(result.isFailure)
        val message = result.exceptionOrNull()?.message
        assertTrue(message?.contains("certificate", ignoreCase = true) == true)
        assertTrue(message?.contains("Unable to reach the server") == false)
    }

    @Test
    fun `submitCheckIn returns success with already checked in false`() = runTest {
        val payload = CheckInOut(sampleRegistration(checkedIn = true), already_checked_in = false)
        coEvery { apiService.submitCheckIn("reg-1", any()) } returns payload

        val result = repository.submitCheckIn("reg-1", "token")

        assertTrue(result.isSuccess)
        assertEquals(false, result.getOrNull()?.already_checked_in)
    }

    @Test
    fun `submitCheckIn returns success with already checked in true`() = runTest {
        val payload = CheckInOut(sampleRegistration(checkedIn = true), already_checked_in = true)
        coEvery { apiService.submitCheckIn("reg-1", any()) } returns payload

        val result = repository.submitCheckIn("reg-1", "token")

        assertTrue(result.isSuccess)
        assertEquals(true, result.getOrNull()?.already_checked_in)
    }

    private fun httpException(code: Int): HttpException = HttpException(
        Response.error<String>(code, "{}".toResponseBody("application/json".toMediaType()))
    )

    private fun sampleRegistration(checkedIn: Boolean = false) = CheckInGuestOut(
        id = "reg-1",
        name = "Jane Doe",
        event_id = "event-1",
        event_title = "Friday Tasting",
        guest_count = 2,
        status = "confirmed",
        checked_in = checkedIn,
        strap_issued = checkedIn
    )
}
