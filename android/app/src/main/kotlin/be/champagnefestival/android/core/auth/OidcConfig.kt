package be.champagnefestival.android.core.auth

import android.net.Uri
import be.champagnefestival.android.BuildConfig

data class OidcConfig(
    val apiBaseUrl: String = BuildConfig.API_BASE_URL,
    val clientId: String = BuildConfig.OIDC_CLIENT_ID,
    val redirectUri: Uri = Uri.parse("be.champagnefestival.android://oauth2redirect"),
)
