package be.champagnefestival.android.core.network

import be.champagnefestival.android.BuildConfig
import be.champagnefestival.android.core.auth.AuthManager
import be.champagnefestival.android.core.storage.ApiBaseUrlOverrideStore
import be.champagnefestival.android.data.api.ChampagneApiService
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor

class NetworkModule(apiBaseUrlOverrideStore: ApiBaseUrlOverrideStore, authManager: AuthManager) {
    private val client =
        OkHttpClient
            .Builder()
            .apply {
                certificatePinner(CertificatePinnerProvider.forCurrentBuild())
                authenticator(TokenAuthenticator(authManager))
            }.addInterceptor(
                DynamicBaseUrlInterceptor {
                    apiBaseUrlOverrideStore.currentOverrideBlocking() ?: BuildConfig.API_BASE_URL
                }
            ).addInterceptor(
                HttpLoggingInterceptor().apply {
                    level =
                        if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.BASIC
                }
            ).build()

    val apiService: ChampagneApiService = ApiServiceFactory.create(BuildConfig.API_BASE_URL, client)
}
