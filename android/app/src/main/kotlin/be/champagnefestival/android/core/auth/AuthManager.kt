package be.champagnefestival.android.core.auth

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import be.champagnefestival.android.core.storage.SessionDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.ResponseTypeValues
import kotlin.coroutines.resume

class AuthManager(
    private val context: Context,
    private val sessionDataStore: SessionDataStore,
    private val applicationScope: CoroutineScope,
    private val oidcConfig: OidcConfig = OidcConfig(),
) {
    private val authService = AuthorizationService(context)

    val loggedIn: StateFlow<String?> = sessionDataStore.accessTokenFlow

    fun startLogin(activity: Activity) {
        applicationScope.launch {
            val configuration = runCatching { fetchConfiguration() }.getOrNull() ?: return@launch
            val request =
                AuthorizationRequest
                    .Builder(
                        configuration,
                        oidcConfig.clientId,
                        ResponseTypeValues.CODE,
                        oidcConfig.redirectUri,
                    ).setScope("openid profile email offline_access")
                    .build()

            withContext(Dispatchers.Main) {
                val completionIntent =
                    Intent(activity, activity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    }
                val cancelIntent =
                    Intent(activity, activity::class.java).apply {
                        action = "be.champagnefestival.android.AUTH_CANCELLED"
                        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    }
                authService.performAuthorizationRequest(
                    request,
                    PendingIntent.getActivity(
                        activity,
                        1001,
                        completionIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                    ),
                    PendingIntent.getActivity(
                        activity,
                        1002,
                        cancelIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                    ),
                )
            }
        }
    }

    suspend fun handleAuthResponse(intent: Intent): Result<Unit> {
        if (intent.action == "be.champagnefestival.android.AUTH_CANCELLED") {
            return Result.failure(IllegalStateException("Sign-in was cancelled."))
        }
        val response = AuthorizationResponse.fromIntent(intent)
        val exception = AuthorizationException.fromIntent(intent)
        if (response == null && exception == null) {
            return Result.success(Unit)
        }
        if (exception != null) {
            return Result.failure(exception)
        }

        return suspendCancellableCoroutine { continuation ->
            authService.performTokenRequest(response!!.createTokenExchangeRequest()) { tokenResponse, tokenException ->
                if (tokenException != null) {
                    continuation.resume(Result.failure(tokenException))
                } else if (tokenResponse == null) {
                    continuation.resume(Result.failure(IllegalStateException("Token exchange failed.")))
                } else {
                    applicationScope.launch {
                        sessionDataStore.saveTokens(
                            accessToken = tokenResponse.accessToken.orEmpty(),
                            refreshToken = tokenResponse.refreshToken,
                            idToken = tokenResponse.idToken,
                        )
                        continuation.resume(Result.success(Unit))
                    }
                }
            }
        }
    }

    fun isLoggedIn(): Boolean = !sessionDataStore.accessTokenFlow.value.isNullOrBlank()

    fun getAccessToken(): String? = sessionDataStore.accessTokenFlow.value

    suspend fun logout() {
        sessionDataStore.clearSession()
    }

    private suspend fun fetchConfiguration(): AuthorizationServiceConfiguration =
        suspendCancellableCoroutine { continuation ->
            AuthorizationServiceConfiguration.fetchFromIssuer(Uri.parse(oidcConfig.issuerUrl)) { config, ex ->
                when {
                    ex != null -> continuation.resumeWith(Result.failure(ex))
                    config != null -> continuation.resume(config)
                    else -> continuation.resumeWith(Result.failure(IllegalStateException("OIDC discovery failed.")))
                }
            }
        }
}
