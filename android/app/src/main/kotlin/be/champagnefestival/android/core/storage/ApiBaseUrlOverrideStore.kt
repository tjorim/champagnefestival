package be.champagnefestival.android.core.storage

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

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
    ) {
        private val dataStore =
            PreferenceDataStoreFactory.create(
                produceFile = { context.preferencesDataStoreFile(PREFERENCES_FILE) },
            )

        val override: Flow<String?> =
            dataStore.data
                .catch { error ->
                    if (error is IOException) emit(emptyPreferences()) else throw error
                }.map { prefs ->
                    prefs[KEY_API_BASE_URL_OVERRIDE]?.takeIf { it.isNotBlank() }
                }

        @Volatile
        private var isCacheLoaded = false

        @Volatile
        private var cachedOverride: String? = null

        /**
         * Synchronous read for request-time consumers (OkHttp interceptors run on background
         * threads). Backed by an in-memory cache after the first read so requests never block
         * on `runBlocking`; the cache is kept in sync by [setOverride] and [clearOverride], the
         * only writers to this store.
         */
        fun currentOverrideBlocking(): String? {
            if (!isCacheLoaded) {
                synchronized(this) {
                    if (!isCacheLoaded) {
                        cachedOverride = runBlocking { override.first() }
                        isCacheLoaded = true
                    }
                }
            }
            return cachedOverride
        }

        suspend fun setOverride(url: String) {
            dataStore.edit { it[KEY_API_BASE_URL_OVERRIDE] = url }
            cachedOverride = url
            isCacheLoaded = true
        }

        suspend fun clearOverride() {
            dataStore.edit { it.remove(KEY_API_BASE_URL_OVERRIDE) }
            cachedOverride = null
            isCacheLoaded = true
        }

        private companion object {
            const val PREFERENCES_FILE = "api_base_url_override"
            val KEY_API_BASE_URL_OVERRIDE = stringPreferencesKey("api_base_url_override")
        }
    }
