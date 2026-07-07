package be.champagnefestival.android

import android.app.Application
import androidx.lifecycle.ProcessLifecycleOwner
import be.champagnefestival.android.core.auth.AuthManager
import be.champagnefestival.android.core.network.ConnectivityObserver
import be.champagnefestival.android.core.network.NetworkModule
import be.champagnefestival.android.core.session.BiometricLockController
import be.champagnefestival.android.core.session.CheckInSyncManager
import be.champagnefestival.android.core.storage.ApiBaseUrlOverrideStore
import be.champagnefestival.android.core.storage.BiometricLockPreferencesStore
import be.champagnefestival.android.core.storage.PendingCheckInStore
import be.champagnefestival.android.data.repository.DefaultCheckInRepository
import be.champagnefestival.android.data.repository.DefaultEditionRepository
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope

@HiltAndroidApp
class ChampagneFestivalApp : Application() {
    @Inject
    lateinit var apiBaseUrlOverrideStore: ApiBaseUrlOverrideStore

    @Inject
    lateinit var biometricLockPreferencesStore: BiometricLockPreferencesStore

    @Inject
    lateinit var authManager: AuthManager

    @Inject
    lateinit var connectivityObserver: ConnectivityObserver

    @Inject
    lateinit var pendingCheckInStore: PendingCheckInStore

    @Inject
    lateinit var applicationScope: CoroutineScope

    lateinit var networkModule: NetworkModule
        private set
    lateinit var checkInRepository: DefaultCheckInRepository
        private set
    lateinit var editionRepository: DefaultEditionRepository
        private set
    lateinit var biometricLockController: BiometricLockController
        private set
    lateinit var checkInSyncManager: CheckInSyncManager
        private set

    override fun onCreate() {
        super.onCreate()
        networkModule = NetworkModule(apiBaseUrlOverrideStore, authManager)
        checkInRepository = DefaultCheckInRepository(networkModule.apiService)
        editionRepository = DefaultEditionRepository(networkModule.apiService)
        biometricLockController = BiometricLockController(biometricLockPreferencesStore)
        ProcessLifecycleOwner.get().lifecycle.addObserver(biometricLockController)
        checkInSyncManager =
            CheckInSyncManager(connectivityObserver, pendingCheckInStore, checkInRepository, applicationScope)
    }
}
