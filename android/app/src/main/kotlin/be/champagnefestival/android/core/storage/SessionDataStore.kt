package be.champagnefestival.android.core.storage

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import be.champagnefestival.android.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.io.IOException

class SessionDataStore(
    context: Context,
    applicationScope: CoroutineScope,
) {
    private val dataStore: DataStore<Preferences> =
        PreferenceDataStoreFactory.create(
            scope = applicationScope,
            produceFile = { context.preferencesDataStoreFile("session_preferences") },
        )

    private val accessTokenKey = stringPreferencesKey("access_token")
    private val refreshTokenKey = stringPreferencesKey("refresh_token")
    private val idTokenKey = stringPreferencesKey("id_token")
    private val apiBaseUrlKey = stringPreferencesKey("api_base_url")
    private val biometricLockEnabledKey = booleanPreferencesKey("biometric_lock_enabled")

    private val _accessTokenFlow = MutableStateFlow<String?>(null)
    val accessTokenFlow: StateFlow<String?> = _accessTokenFlow

    private val _refreshTokenFlow = MutableStateFlow<String?>(null)
    val refreshTokenFlow: StateFlow<String?> = _refreshTokenFlow

    private val _idTokenFlow = MutableStateFlow<String?>(null)
    val idTokenFlow: StateFlow<String?> = _idTokenFlow

    private val _apiBaseUrlFlow = MutableStateFlow<String?>(null)
    val apiBaseUrlFlow: StateFlow<String?> = _apiBaseUrlFlow

    // Event-device threat model: lock is opt-out, not opt-in.
    private val _biometricLockEnabledFlow = MutableStateFlow(DEFAULT_BIOMETRIC_LOCK_ENABLED)
    val biometricLockEnabledFlow: StateFlow<Boolean> = _biometricLockEnabledFlow

    init {
        applicationScope.launch {
            dataStore.data
                .catch { exception ->
                    if (exception is IOException) {
                        emit(emptyPreferences())
                    } else {
                        throw exception
                    }
                }.map { preferences ->
                    SessionSnapshot(
                        accessToken = preferences[accessTokenKey],
                        refreshToken = preferences[refreshTokenKey],
                        idToken = preferences[idTokenKey],
                        apiBaseUrl = preferences[apiBaseUrlKey] ?: BuildConfig.API_BASE_URL,
                        biometricLockEnabled = preferences[biometricLockEnabledKey] ?: DEFAULT_BIOMETRIC_LOCK_ENABLED,
                    )
                }.collect { snapshot ->
                    _accessTokenFlow.value = snapshot.accessToken
                    _refreshTokenFlow.value = snapshot.refreshToken
                    _idTokenFlow.value = snapshot.idToken
                    _apiBaseUrlFlow.value = snapshot.apiBaseUrl
                    _biometricLockEnabledFlow.value = snapshot.biometricLockEnabled
                }
        }
    }

    suspend fun saveTokens(
        accessToken: String,
        refreshToken: String?,
        idToken: String?,
    ) {
        dataStore.edit { preferences ->
            preferences[accessTokenKey] = accessToken
            refreshToken?.let { preferences[refreshTokenKey] = it }
            idToken?.let { preferences[idTokenKey] = it }
        }
    }

    suspend fun saveApiBaseUrl(url: String) {
        dataStore.edit { preferences ->
            preferences[apiBaseUrlKey] = url
        }
    }

    suspend fun clearApiBaseUrlOverride() {
        dataStore.edit { preferences ->
            preferences.remove(apiBaseUrlKey)
        }
    }

    suspend fun clearSession() {
        dataStore.edit { preferences ->
            preferences.remove(accessTokenKey)
            preferences.remove(refreshTokenKey)
            preferences.remove(idTokenKey)
        }
    }

    suspend fun setBiometricLockEnabled(enabled: Boolean) {
        dataStore.edit { preferences ->
            preferences[biometricLockEnabledKey] = enabled
        }
    }

    private companion object {
        const val DEFAULT_BIOMETRIC_LOCK_ENABLED = true
    }
}

private data class SessionSnapshot(
    val accessToken: String?,
    val refreshToken: String?,
    val idToken: String?,
    val apiBaseUrl: String,
    val biometricLockEnabled: Boolean,
)
