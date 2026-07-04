package be.champagnefestival.android.core.auth

import android.net.Uri
import be.champagnefestival.android.BuildConfig

data class OidcConfig(
    val clientId: String = BuildConfig.OIDC_CLIENT_ID,
    val redirectUri: Uri = Uri.parse("${BuildConfig.APPLICATION_ID}://oauth2redirect"),
    val scope: String = "openid profile email offline_access"
)
