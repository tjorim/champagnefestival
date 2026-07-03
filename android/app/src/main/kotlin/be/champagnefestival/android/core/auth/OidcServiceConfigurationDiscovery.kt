package be.champagnefestival.android.core.auth

import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.openid.appauth.AuthorizationServiceConfiguration
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException

class OidcServiceConfigurationDiscovery(
    private val client: OkHttpClient = OkHttpClient(),
) {
    suspend fun fetch(apiBaseUrl: String): AuthorizationServiceConfiguration =
        withContext(Dispatchers.IO) {
            client.newCall(Request.Builder().url(configUrl(apiBaseUrl)).build()).execute().use { response ->
                val body = response.body.string()
                if (!response.isSuccessful) {
                    throw IOException("OIDC config endpoint returned HTTP ${response.code}: $body")
                }
                if (body.isBlank()) {
                    throw IOException("Empty response from OIDC config endpoint")
                }
                parse(body)
            }
        }

    private fun configUrl(apiBaseUrl: String): String = "${apiBaseUrl.trimEnd('/')}/api/auth/oidc-config"

    private fun parse(body: String): AuthorizationServiceConfiguration =
        try {
            val json = JSONObject(body)
            AuthorizationServiceConfiguration(
                Uri.parse(json.getString("authorization_url")),
                Uri.parse(json.getString("token_url")),
            )
        } catch (exception: JSONException) {
            throw IOException("Failed to parse OIDC config response", exception)
        }
}
