package be.champagnefestival.android.feature.registration

import app.cash.turbine.test
import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.data.model.CheckInOut
import be.champagnefestival.android.data.repository.CheckInRepository
import be.champagnefestival.android.data.repository.UnauthorizedException
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CheckInViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val repository = mockk<CheckInRepository>()
    private lateinit var viewModel: CheckInViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        viewModel = CheckInViewModel(repository)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state is loading when registration is requested`() = runTest {
        viewModel.uiState.test {
            assertEquals(CheckInUiState.Loading, awaitItem())
        }
    }

    @Test
    fun `success state on successful lookup`() = runTest {
        val registration = sampleRegistration()
        coEvery { repository.lookupRegistration("reg-1", "token") } returns Result.success(registration)

        viewModel.uiState.test {
            assertEquals(CheckInUiState.Loading, awaitItem())
            viewModel.loadRegistration("reg-1", "token")
            dispatcher.scheduler.advanceUntilIdle()
            assertEquals(CheckInUiState.RegistrationLoaded(registration), awaitItem())
        }
    }

    @Test
    fun `error state on network failure`() = runTest {
        coEvery { repository.lookupRegistration("reg-1", "token") } returns
            Result.failure(IllegalStateException("Network down"))

        viewModel.uiState.test {
            awaitItem()
            viewModel.loadRegistration("reg-1", "token")
            dispatcher.scheduler.advanceUntilIdle()
            assertEquals(CheckInUiState.Error("Network down"), awaitItem())
        }
    }

    @Test
    fun `unauthorized state on 401`() = runTest {
        coEvery { repository.lookupRegistration("reg-1", "token") } returns Result.failure(UnauthorizedException())

        viewModel.uiState.test {
            awaitItem()
            viewModel.loadRegistration("reg-1", "token")
            dispatcher.scheduler.advanceUntilIdle()
            assertEquals(CheckInUiState.Unauthorized, awaitItem())
        }
    }

    @Test
    fun `submit check-in success`() = runTest {
        val registration = sampleRegistration(checkedIn = true)
        coEvery { repository.submitCheckIn("reg-1", "token") } returns
            Result.success(CheckInOut(registration, already_checked_in = false))

        viewModel.uiState.test {
            awaitItem()
            viewModel.submitCheckIn("reg-1", "token")
            dispatcher.scheduler.advanceUntilIdle()
            assertEquals(CheckInUiState.CheckInSuccess(registration, alreadyCheckedIn = false), awaitItem())
        }
    }

    @Test
    fun `submit check-in already checked in state`() = runTest {
        val registration = sampleRegistration(checkedIn = true)
        coEvery { repository.submitCheckIn("reg-1", "token") } returns
            Result.success(CheckInOut(registration, already_checked_in = true))

        viewModel.uiState.test {
            awaitItem()
            viewModel.submitCheckIn("reg-1", "token")
            dispatcher.scheduler.advanceUntilIdle()
            assertEquals(CheckInUiState.CheckInSuccess(registration, alreadyCheckedIn = true), awaitItem())
        }
    }

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
