package be.champagnefestival.android

import android.app.Application
import be.champagnefestival.android.core.auth.AuthManager
import be.champagnefestival.android.core.network.NetworkModule
import be.champagnefestival.android.core.storage.SessionDataStore
import be.champagnefestival.android.data.repository.DefaultCheckInRepository
import be.champagnefestival.android.data.repository.DefaultEditionRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class ChampagneFestivalApp : Application() {
    val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    lateinit var sessionDataStore: SessionDataStore
        private set
    lateinit var authManager: AuthManager
        private set
    lateinit var networkModule: NetworkModule
        private set
    lateinit var checkInRepository: DefaultCheckInRepository
        private set
    lateinit var editionRepository: DefaultEditionRepository
        private set

    override fun onCreate() {
        super.onCreate()
        sessionDataStore = SessionDataStore(this, applicationScope)
        authManager = AuthManager(this, sessionDataStore, applicationScope)
        networkModule = NetworkModule(sessionDataStore)
        checkInRepository = DefaultCheckInRepository(networkModule.apiService)
        editionRepository = DefaultEditionRepository(networkModule.apiService)
    }
}
