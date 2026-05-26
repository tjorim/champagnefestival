package be.champagnefestival.android.data.model

import kotlinx.serialization.Serializable

@Serializable
data class OrderItem(
    val product_id: String,
    val name: String,
    val quantity: Int,
    val price: Double,
    val category: String,
    val delivered_quantity: Int? = null,
    val delivered: Boolean = false,
)

@Serializable
data class CheckInGuestOut(
    val id: String,
    val name: String,
    val event_id: String,
    val event_title: String,
    val table_id: String? = null,
    val table_name: String? = null,
    val guest_count: Int,
    val pre_orders: List<OrderItem> = emptyList(),
    val notes: String = "",
    val status: String,
    val checked_in: Boolean,
    val checked_in_at: String? = null,
    val strap_issued: Boolean,
)

@Serializable
data class CheckInLookupRequest(val token: String)

@Serializable
data class CheckInRequest(val token: String, val issue_strap: Boolean = true)

@Serializable
data class CheckInOut(
    val registration: CheckInGuestOut,
    val already_checked_in: Boolean,
)
