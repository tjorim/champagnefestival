package be.champagnefestival.android.core.auth

import android.net.Uri
import be.champagnefestival.android.core.network.CertificatePinnerProvider
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.openid.appauth.AuthorizationServiceConfiguration
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONException
import org.json.JSONObject

class OidcServiceConfigurationDiscovery(
    // Discovery returns the endpoints the whole auth flow trusts, so it must be
    // pinned exactly like the API client; a plain OkHttpClient would let a
    // MITM with a rogue CA swap in attacker-controlled authorization/token URLs.
    client: OkHttpClient =
        OkHttpClient
            .Builder()
            .certificatePinner(CertificatePinnerProvider.forCurrentBuild())
            .build()
) {
    // A redirect must never move discovery elsewhere; derived from the injected
    // client to keep its certificate pinning.
    private val client: OkHttpClient =
        client.newBuilder().followRedirects(false).followSslRedirects(false).build()

    suspend fun fetch(apiBaseUrl: String): AuthorizationServiceConfiguration = withContext(Dispatchers.IO) {
        client.newCall(Request.Builder().url(configUrl(apiBaseUrl)).build()).execute().use { response ->
            if (!response.isSuccessful) {
                // Peek a bounded snippet: an arbitrary server behind a user-set URL can
                // return an error page of any size, which must not be fully buffered.
                val errorBody = runCatching { response.peekBody(1024).string() }.getOrElse { "" }
                throw IOException("OIDC config endpoint returned HTTP ${response.code}: $errorBody")
            }
            // Bound the success body like the error snippet: the URL is user-configurable.
            val bytes = runCatching { response.peekBody(MAX_BODY_BYTES + 1).bytes() }.getOrElse { ByteArray(0) }
            if (bytes.size > MAX_BODY_BYTES) {
                throw IOException("OIDC config response is too large")
            }
            val body = bytes.decodeToString()
            if (body.isBlank()) {
                throw IOException("Empty response from OIDC config endpoint")
            }
            parse(body)
        }
    }

    private fun configUrl(apiBaseUrl: String): String = "${apiBaseUrl.trimEnd('/')}/api/auth/oidc-config"

    private fun parse(body: String): AuthorizationServiceConfiguration = try {
        val json = JSONObject(body)
        val authorizationUrl = endpoint(json.getString("authorization_url"))
        val tokenUrl = endpoint(json.getString("token_url"))
        val endSessionUrl = json.optString("end_session_url").takeIf { it.isNotBlank() }?.let(::endpoint)
        // A token request must never go to a different server than the sign-in page.
        val host = hostOf(authorizationUrl)
        if (hostOf(tokenUrl) != host || (endSessionUrl != null && hostOf(endSessionUrl) != host)) {
            throw IOException("OIDC config endpoints must share one host")
        }
        AuthorizationServiceConfiguration(
            Uri.parse(authorizationUrl),
            Uri.parse(tokenUrl),
            null,
            endSessionUrl?.let(Uri::parse)
        )
    } catch (exception: JSONException) {
        throw IOException("Failed to parse OIDC config response", exception)
    }

    private fun endpoint(value: String): String {
        val url = value.toHttpUrlOrNull() ?: throw IOException("OIDC config contains an invalid endpoint URL")
        if (!(url.isHttps || url.host in CLEARTEXT_DEV_HOSTS) || hasExtraParts(url)) {
            throw IOException("OIDC config endpoints must be plain HTTPS URLs")
        }
        return value
    }

    private fun hasExtraParts(url: HttpUrl): Boolean =
        url.username.isNotEmpty() || url.password.isNotEmpty() || url.encodedQuery != null || url.fragment != null

    private fun hostOf(value: String): String = checkNotNull(value.toHttpUrlOrNull()).host

    private companion object {
        // Cleartext only where the network security config already allows it: the
        // emulator's host loopback and local development.
        val CLEARTEXT_DEV_HOSTS = setOf("localhost", "127.0.0.1", "::1", "10.0.2.2")
        const val MAX_BODY_BYTES = 64L * 1024
    }
}
