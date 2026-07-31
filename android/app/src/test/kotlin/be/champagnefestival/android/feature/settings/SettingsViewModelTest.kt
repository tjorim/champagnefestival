package be.champagnefestival.android.feature.settings

import android.content.Intent
import app.cash.turbine.test
import be.champagnefestival.android.BuildConfig
import be.champagnefestival.android.core.auth.AuthManager
import be.champagnefestival.android.core.storage.ApiBaseUrlOverrideStore
import be.champagnefestival.android.core.storage.BiometricLockPreferencesStore
import be.champagnefestival.android.ui.UiState
import io.mockk.Runs
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val apiBaseUrlFlow = MutableStateFlow<String?>(null)
    private val biometricLockFlow = MutableStateFlow<Boolean?>(true)
    private val apiBaseUrlOverrideStore =
        mockk<ApiBaseUrlOverrideStore> {
            every { override } returns apiBaseUrlFlow
        }
    private val biometricLockPreferencesStore =
        mockk<BiometricLockPreferencesStore> {
            every { biometricLockEnabledFlow } returns biometricLockFlow
        }
    private val authManager = mockk<AuthManager>()
    private lateinit var viewModel: SettingsViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        viewModel =
            SettingsViewModel(
                apiBaseUrlOverrideStore = apiBaseUrlOverrideStore,
                biometricLockPreferencesStore = biometricLockPreferencesStore,
                authManager = authManager
            )
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `loads settings from the backing preference flows`() = runTest {
        viewModel.uiState.test {
            assertEquals(UiState.Loading, awaitItem())
            dispatcher.scheduler.advanceUntilIdle()
            val state = awaitItem()
            assertTrue(state is UiState.Success)
            val settings = (state as UiState.Success).data
            assertEquals(BuildConfig.API_BASE_URL, settings.apiBaseUrl)
            assertTrue(settings.biometricLockEnabled)
        }
    }

    @Test
    fun `retry re-subscribes without throwing and lands on success again`() = runTest {
        dispatcher.scheduler.advanceUntilIdle()

        // The error screen's Retry button calls this directly; it must be safe to invoke
        // again on a ViewModel whose initial collection is already live.
        viewModel.loadSettings()
        dispatcher.scheduler.advanceUntilIdle()

        assertTrue(viewModel.uiState.value is UiState.Success)
    }

    @Test
    fun `logout shows a pending state and emits the end-session intent without logging out yet`() = runTest {
        val endSessionIntent = mockk<Intent>()
        coEvery { authManager.buildLogoutIntent() } returns endSessionIntent

        viewModel.logoutIntent.test {
            viewModel.isLoggingOut.test {
                assertFalse(awaitItem())
                viewModel.logout()
                // logout() launches on viewModelScope; StandardTestDispatcher queues rather
                // than runs it inline, so the scheduler must be driven before the pending
                // flag's new value is observable.
                dispatcher.scheduler.advanceUntilIdle()
                assertTrue(awaitItem())
            }
            assertEquals(endSessionIntent, awaitItem())
        }

        // The end-session browser activity is still open at this point. Reporting
        // "logged out" here would leave a live Keycloak session behind a signed-out UI,
        // and the next sign-in would then silently succeed via SSO.
        assertFalse(viewModel.loggedOut.value)
        verify(exactly = 0) { authManager.completeLogout() }
    }

    @Test
    fun `logout completes once the end-session flow returns, whatever its result`() = runTest {
        val endSessionIntent = mockk<Intent>()
        coEvery { authManager.buildLogoutIntent() } returns endSessionIntent
        every { authManager.completeLogout() } just Runs

        viewModel.logout()
        dispatcher.scheduler.advanceUntilIdle()
        viewModel.onLogoutFlowFinished()

        assertTrue(viewModel.loggedOut.value)
        verify(exactly = 1) { authManager.completeLogout() }
    }

    @Test
    fun `logout completes immediately when there is no end-session endpoint to reach`() = runTest {
        coEvery { authManager.buildLogoutIntent() } returns null
        every { authManager.completeLogout() } just Runs

        viewModel.logout()
        dispatcher.scheduler.advanceUntilIdle()

        assertTrue(viewModel.loggedOut.value)
        verify(exactly = 1) { authManager.completeLogout() }
    }

    @Test
    fun `the flow-finished callback alone completes sign-out cleanly`() = runTest {
        every { authManager.completeLogout() } just Runs

        viewModel.onLogoutFlowFinished()

        assertTrue(viewModel.loggedOut.value)
        verify(exactly = 1) { authManager.completeLogout() }
    }

    @Test
    fun `a second logout tap while one is in flight does not fire twice`() = runTest {
        coEvery { authManager.buildLogoutIntent() } returns mockk<Intent>()

        viewModel.logout()
        // Let the first tap's coroutine actually flip the guard flag before the second
        // tap checks it — otherwise both calls would race past the guard together.
        dispatcher.scheduler.runCurrent()
        viewModel.logout()
        dispatcher.scheduler.advanceUntilIdle()

        coVerify(exactly = 1) { authManager.buildLogoutIntent() }
    }
}
