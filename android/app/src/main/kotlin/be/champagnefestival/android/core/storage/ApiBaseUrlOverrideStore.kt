package be.champagnefestival.android.core.storage

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Persists an optional runtime override for the API base URL, letting an installed build
 * target a different backend without reinstalling another build variant.
 * When no override is set, callers fall back to the build-configured default.
 */
@Singleton
class ApiBaseUrlOverrideStore
@Inject
constructor(
    @ApplicationContext context: Context,
    applicationScope: CoroutineScope
) {
    private val dataStore =
        PreferenceDataStoreFactory.create(
            scope = applicationScope,
            produceFile = { context.preferencesDataStoreFile(PREFERENCES_FILE) }
        )

    private val overrideFlow: Flow<String?> =
        dataStore
            .data
            .catch { error ->
                if (error is IOException) emit(emptyPreferences()) else throw error
            }.map { prefs ->
                prefs[KEY_API_BASE_URL_OVERRIDE]?.takeIf { it.isNotBlank() }
            }

    private val _override = MutableStateFlow<String?>(null)
    val override: StateFlow<String?> = _override.asStateFlow()

    init {
        applicationScope.launch {
            overrideFlow.collect { _override.value = it }
        }
    }

    /**
     * Synchronous read for request-time consumers (OkHttp interceptors run on background
     * threads). Backed by an in-memory cache kept in sync by the application-scope
     * DataStore collection.
     */
    fun currentOverrideBlocking(): String? = override.value

    suspend fun setOverride(url: String) {
        dataStore.edit { it[KEY_API_BASE_URL_OVERRIDE] = url }
        _override.value = url
    }

    suspend fun clearOverride() {
        dataStore.edit { it.remove(KEY_API_BASE_URL_OVERRIDE) }
        _override.value = null
    }

    private companion object {
        const val PREFERENCES_FILE = "api_base_url_override"
        val KEY_API_BASE_URL_OVERRIDE = stringPreferencesKey("api_base_url_override")
    }
}
