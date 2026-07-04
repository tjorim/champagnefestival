package be.champagnefestival.android.data.model

import kotlinx.serialization.Serializable

@Serializable
data class EditionSummary(
    val id: String,
    val year: Int,
    val month: String,
    val edition_type: String,
    val active: Boolean
)

@Serializable
data class EventSummary(
    val id: String,
    val edition_id: String,
    val title: String,
    val description: String = "",
    val date: String,
    val start_time: String,
    val end_time: String? = null,
    val category: String,
    val registration_required: Boolean,
    val active: Boolean,
    val edition: EditionSummary? = null
)

@Serializable
data class EditionOut(
    val id: String,
    val year: Int,
    val month: String,
    val edition_type: String,
    val active: Boolean,
    val events: List<EventSummary> = emptyList()
)
