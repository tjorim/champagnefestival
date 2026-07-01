package be.champagnefestival.android.core.network

import be.champagnefestival.android.core.auth.AuthManager
import be.champagnefestival.android.core.storage.SessionDataStore
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

class TokenAuthenticator(
    private val sessionDataStore: SessionDataStore,
    private val authManager: AuthManager,
) : Authenticator {
    override fun authenticate(
        route: Route?,
        response: Response,
    ): Request? {
        if (response.priorResponse != null) return null
        val authHeader = response.request.header("Authorization") ?: return null
        val failedToken = authHeader.removePrefix("Bearer ").trim()

        return runBlocking {
            val currentToken = sessionDataStore.accessTokenFlow.value
            val tokenToUse =
                if (!currentToken.isNullOrBlank() && currentToken != failedToken) {
                    currentToken
                } else {
                    authManager.getFreshAccessToken()
                }

            tokenToUse?.let { token ->
                response.request
                    .newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
            }
        }
    }
}
