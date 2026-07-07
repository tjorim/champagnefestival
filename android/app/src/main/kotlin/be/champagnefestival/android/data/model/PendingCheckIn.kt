package be.champagnefestival.android.data.model

import kotlinx.serialization.Serializable

/** A check-in that couldn't be submitted while offline, queued for background sync. */
@Serializable
data class PendingCheckIn(val id: String, val token: String, val queuedAtEpochMillis: Long)
