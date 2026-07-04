package be.champagnefestival.android.core.network

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Rewrites each request's scheme/host/port to the currently configured API base URL,
 * reading it fresh on every request (instead of once at [okhttp3.OkHttpClient] construction
 * time) so a runtime override set on the Settings screen takes effect on the very next
 * request instead of requiring an app restart.
 *
 * [baseUrlProvider] is expected to already resolve the effective base URL — i.e. the
 * user's override when one is set, otherwise the build's default — as `ApiBaseUrlOverrideStore`
 * does via `currentOverrideBlocking()`. Returns the request untouched when the provider yields
 * null or an unparseable URL, leaving OkHttp's own configured base URL in effect.
 */
class DynamicBaseUrlInterceptor(private val baseUrlProvider: () -> String?) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val target = baseUrlProvider()?.toHttpUrlOrNull() ?: return chain.proceed(request)
        val rewrittenUrl =
            request.url
                .newBuilder()
                .scheme(target.scheme)
                .host(target.host)
                .port(target.port)
                .build()
        return chain.proceed(request.newBuilder().url(rewrittenUrl).build())
    }

    companion object {
        fun isValidOverride(value: String): Boolean = value.toHttpUrlOrNull() != null
    }
}
