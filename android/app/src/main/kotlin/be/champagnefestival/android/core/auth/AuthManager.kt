package be.champagnefestival.android.core.auth

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import be.champagnefestival.android.BuildConfig
import be.champagnefestival.android.core.storage.ApiBaseUrlOverrideStore
import be.champagnefestival.android.core.storage.SecureSessionStore
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import net.openid.appauth.AuthState
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.ResponseTypeValues

@Singleton
class AuthManager
@Inject
constructor(
    @ApplicationContext private val context: Context,
    private val secureSessionStore: SecureSessionStore,
    private val apiBaseUrlOverrideStore: ApiBaseUrlOverrideStore,
    private val oidcConfig: OidcConfig,
    private val oidcDiscovery: OidcServiceConfigurationDiscovery
) {
    private val authService = AuthorizationService(context)
    private val refreshMutex = Mutex()
    private val configMutex = Mutex()
    private var cachedConfiguration: Pair<String, AuthorizationServiceConfiguration>? = null

    @Volatile
    private var authState: AuthState = loadPersistedState()

    private val _loggedIn = MutableStateFlow(authState.accessToken)
    val loggedIn: StateFlow<String?> = _loggedIn.asStateFlow()

    suspend fun startLogin(activity: Activity): Result<Unit> {
        val configuration = runCatching { fetchConfiguration() }.getOrElse { return Result.failure(it) }
        val request =
            AuthorizationRequest
                .Builder(
                    configuration,
                    oidcConfig.clientId,
                    ResponseTypeValues.CODE,
                    oidcConfig.redirectUri
                ).setScope(oidcConfig.scope)
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
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                ),
                PendingIntent.getActivity(
                    activity,
                    1002,
                    cancelIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                )
            )
        }
        return Result.success(Unit)
    }

    /**
     * Exchanges the stored refresh token for a new access token via AppAuth's own
     * [AuthState] bookkeeping. Used by
     * [be.champagnefestival.android.core.network.TokenAuthenticator] to recover from an
     * expired access token without forcing the user to sign in again mid-shift.
     */
    suspend fun getFreshAccessToken(): String? = refreshMutex.withLock {
        suspendCancellableCoroutine { continuation ->
            authState.performActionWithFreshTokens(authService) { accessToken, _, exception ->
                if (exception != null || accessToken.isNullOrBlank()) {
                    clearState()
                    continuation.resume(null)
                    return@performActionWithFreshTokens
                }
                persistState(authState)
                continuation.resume(accessToken)
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
            authService.performTokenRequest(response!!.createTokenExchangeRequest()) {
                    tokenResponse,
                    tokenException
                ->
                if (tokenException != null) {
                    continuation.resume(Result.failure(tokenException))
                } else if (tokenResponse == null) {
                    continuation.resume(Result.failure(IllegalStateException("Token exchange failed.")))
                } else {
                    val newState = AuthState(response, null).apply { update(tokenResponse, tokenException) }
                    persistState(newState)
                    continuation.resume(Result.success(Unit))
                }
            }
        }
    }

    fun isLoggedIn(): Boolean = !authState.accessToken.isNullOrBlank()

    fun getAccessToken(): String? = authState.accessToken

    fun logout() {
        clearState()
    }

    /**
     * OIDC discovery only needs to happen once per process; the issuer's configuration
     * does not change at runtime. Cache it so login and every token refresh don't each
     * pay for a round trip to the discovery endpoint.
     */
    private suspend fun fetchConfiguration(): AuthorizationServiceConfiguration {
        val apiBaseUrl = apiBaseUrlOverrideStore.override.value ?: BuildConfig.API_BASE_URL
        cachedConfiguration?.takeIf { it.first == apiBaseUrl }?.let { return it.second }
        return configMutex.withLock {
            cachedConfiguration?.takeIf { it.first == apiBaseUrl }?.second
                ?: oidcDiscovery.fetch(apiBaseUrl).also { cachedConfiguration = apiBaseUrl to it }
        }
    }

    private fun loadPersistedState(): AuthState {
        val json = secureSessionStore.readAuthStateJson() ?: return AuthState()
        return runCatching { AuthState.jsonDeserialize(json) }.getOrElse { AuthState() }
    }

    private fun persistState(state: AuthState) {
        authState = state
        secureSessionStore.writeAuthStateJson(state.jsonSerializeString())
        _loggedIn.value = state.accessToken
    }

    private fun clearState() {
        authState = AuthState()
        secureSessionStore.clear()
        _loggedIn.value = null
    }
}
