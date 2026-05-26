package be.champagnefestival.android.core.auth

import android.net.Uri
import be.champagnefestival.android.BuildConfig

data class OidcConfig(
    val issuerUrl: String = BuildConfig.OIDC_ISSUER_URL,
    val clientId: String = BuildConfig.OIDC_CLIENT_ID,
    val redirectUri: Uri = Uri.parse("be.champagnefestival.android://oauth2redirect"),
)
