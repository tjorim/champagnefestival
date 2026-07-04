package be.champagnefestival.android.core.storage

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BiometricLockPreferencesStore
@Inject
constructor(
    @ApplicationContext context: Context,
    applicationScope: CoroutineScope,
) {
    private val dataStore: DataStore<Preferences> =
        PreferenceDataStoreFactory.create(
            scope = applicationScope,
            produceFile = { context.preferencesDataStoreFile("biometric_lock_preferences") },
        )

    private val biometricLockEnabledKey = booleanPreferencesKey("biometric_lock_enabled")

    // Event-device threat model: lock is opt-out, not opt-in. Null until the persisted
    // value has been read, so callers can distinguish "loading" from "disabled".
    private val _biometricLockEnabledFlow = MutableStateFlow<Boolean?>(null)
    val biometricLockEnabledFlow: StateFlow<Boolean?> = _biometricLockEnabledFlow

    init {
        applicationScope.launch {
            dataStore.data
                .catch { exception ->
                    if (exception is IOException) emit(emptyPreferences()) else throw exception
                }.map { it[biometricLockEnabledKey] ?: DEFAULT_BIOMETRIC_LOCK_ENABLED }
                .collect { _biometricLockEnabledFlow.value = it }
        }
    }

    suspend fun setBiometricLockEnabled(enabled: Boolean) {
        dataStore.edit { it[biometricLockEnabledKey] = enabled }
    }

    private companion object {
        const val DEFAULT_BIOMETRIC_LOCK_ENABLED = true
    }
}
