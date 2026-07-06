package be.champagnefestival.android.feature.lookup

import app.cash.turbine.test
import be.champagnefestival.android.data.model.CheckInGuestOut
import be.champagnefestival.android.data.repository.ApiErrorReason
import be.champagnefestival.android.data.repository.CheckInRepository
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
class GuestLookupViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val repository = mockk<CheckInRepository>()
    private lateinit var viewModel: GuestLookupViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        viewModel = GuestLookupViewModel(repository = repository, authTokenProvider = { "jwt" })
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state is idle`() = runTest {
        assertEquals(GuestLookupUiState.Idle, viewModel.uiState.value)
    }

    @Test
    fun `search results loading state`() = runTest {
        coEvery { repository.searchRegistrations(any(), any(), any()) } returns Result.success(emptyList())

        viewModel.uiState.test {
            assertEquals(GuestLookupUiState.Idle, awaitItem())
            viewModel.search("Jane", null)
            dispatcher.scheduler.advanceTimeBy(300)
            assertEquals(GuestLookupUiState.Loading, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `search results success`() = runTest {
        val registrations = listOf(sampleRegistration())
        coEvery { repository.searchRegistrations("Jane", null, "jwt") } returns Result.success(registrations)

        viewModel.uiState.test {
            awaitItem()
            viewModel.search("Jane", null)
            dispatcher.scheduler.advanceTimeBy(300)
            assertEquals(GuestLookupUiState.Loading, awaitItem())
            dispatcher.scheduler.advanceUntilIdle()
            assertEquals(GuestLookupUiState.Success(registrations), awaitItem())
        }
    }

    @Test
    fun `search results error`() = runTest {
        coEvery { repository.searchRegistrations("Jane", null, "jwt") } returns
            Result.failure(IllegalStateException("Boom"))

        viewModel.uiState.test {
            awaitItem()
            viewModel.search("Jane", null)
            dispatcher.scheduler.advanceTimeBy(300)
            assertEquals(GuestLookupUiState.Loading, awaitItem())
            dispatcher.scheduler.advanceUntilIdle()
            assertEquals(GuestLookupUiState.Error(ApiErrorReason.UNKNOWN), awaitItem())
        }
    }

    @Test
    fun `empty search results`() = runTest {
        coEvery { repository.searchRegistrations("Jane", null, "jwt") } returns Result.success(emptyList())

        viewModel.uiState.test {
            awaitItem()
            viewModel.search("Jane", null)
            dispatcher.scheduler.advanceTimeBy(300)
            awaitItem()
            dispatcher.scheduler.advanceUntilIdle()
            assertEquals(GuestLookupUiState.Success(emptyList()), awaitItem())
        }
    }

    private fun sampleRegistration() = CheckInGuestOut(
        id = "reg-1",
        name = "Jane Doe",
        event_id = "event-1",
        event_title = "Friday Tasting",
        guest_count = 2,
        status = "confirmed",
        checked_in = false,
        strap_issued = false
    )
}
