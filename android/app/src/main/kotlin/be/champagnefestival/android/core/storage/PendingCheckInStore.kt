package be.champagnefestival.android.core.storage

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import be.champagnefestival.android.data.model.PendingCheckIn
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Persists check-ins that couldn't be submitted while offline, so they can be retried once
 * connectivity returns without staff needing to rescan the wristband.
 */
@Singleton
class PendingCheckInStore @Inject constructor(@ApplicationContext context: Context, applicationScope: CoroutineScope) {
    private val dataStore =
        PreferenceDataStoreFactory.create(
            scope = applicationScope,
            produceFile = { context.preferencesDataStoreFile(PREFERENCES_FILE) }
        )

    private val pendingFlow: Flow<List<PendingCheckIn>> =
        dataStore
            .data
            .catch { error ->
                if (error is IOException) emit(emptyPreferences()) else throw error
            }.map { prefs -> decode(prefs[KEY_PENDING_CHECK_INS]) }

    val pending: StateFlow<List<PendingCheckIn>> =
        pendingFlow.stateIn(scope = applicationScope, started = SharingStarted.Eagerly, initialValue = emptyList())

    suspend fun enqueue(item: PendingCheckIn) {
        dataStore.edit { prefs ->
            val current = decode(prefs[KEY_PENDING_CHECK_INS])
            if (current.none { it.id == item.id }) {
                prefs[KEY_PENDING_CHECK_INS] = json.encodeToString(current + item)
            }
        }
    }

    suspend fun remove(id: String) {
        dataStore.edit { prefs ->
            val current = decode(prefs[KEY_PENDING_CHECK_INS])
            prefs[KEY_PENDING_CHECK_INS] = json.encodeToString(current.filterNot { it.id == id })
        }
    }

    private fun decode(raw: String?): List<PendingCheckIn> = raw
        ?.takeIf { it.isNotBlank() }
        ?.let { runCatching { json.decodeFromString<List<PendingCheckIn>>(it) }.getOrDefault(emptyList()) }
        ?: emptyList()

    private companion object {
        const val PREFERENCES_FILE = "pending_check_ins"
        val KEY_PENDING_CHECK_INS = stringPreferencesKey("pending_check_ins")
        val json = Json { ignoreUnknownKeys = true }
    }
}
