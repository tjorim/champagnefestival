package be.champagnefestival.android.core.session

import be.champagnefestival.android.core.network.ConnectivityObserver
import be.champagnefestival.android.core.storage.PendingCheckInStore
import be.champagnefestival.android.data.repository.CheckInRepository
import be.champagnefestival.android.data.repository.UnauthorizedException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

/**
 * Drains [PendingCheckInStore] whenever connectivity returns, so a check-in queued while
 * offline gets submitted automatically without staff needing to rescan the wristband.
 */
class CheckInSyncManager(
    connectivityObserver: ConnectivityObserver,
    private val pendingCheckInStore: PendingCheckInStore,
    private val checkInRepository: CheckInRepository,
    applicationScope: CoroutineScope
) {
    init {
        applicationScope.launch {
            connectivityObserver.isOnline
                .filter { isOnline -> isOnline }
                .collect { syncPending() }
        }
    }

    suspend fun syncPending() {
        pendingCheckInStore.pending.value.forEach { item ->
            checkInRepository.submitCheckIn(id = item.id, token = item.token).fold(
                onSuccess = { pendingCheckInStore.remove(item.id) },
                onFailure = { error ->
                    // Invalid/stale token means retrying forever can't succeed for this item.
                    if (error is UnauthorizedException) {
                        pendingCheckInStore.remove(item.id)
                    }
                }
            )
        }
    }
}
