package be.champagnefestival.android.core.network

import be.champagnefestival.android.BuildConfig
import be.champagnefestival.android.core.storage.SessionDataStore
import be.champagnefestival.android.data.api.ChampagneApiService
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor

class NetworkModule(
    sessionDataStore: SessionDataStore,
) {
    private val client =
        OkHttpClient
            .Builder()
            .apply {
                CertificatePinnerProvider.forCurrentBuild()?.let(::certificatePinner)
            }.addInterceptor { chain ->
                val originalRequest = chain.request()
                val overrideBaseUrl =
                    sessionDataStore.apiBaseUrlFlow.value
                        ?: runBlocking { sessionDataStore.apiBaseUrlFlow.filterNotNull().first() }
                val overrideBase = overrideBaseUrl.toHttpUrlOrNull()
                val updatedRequest =
                    if (overrideBase != null) {
                        val updatedUrl =
                            originalRequest.url
                                .newBuilder()
                                .scheme(overrideBase.scheme)
                                .host(overrideBase.host)
                                .port(overrideBase.port)
                                .build()
                        originalRequest.newBuilder().url(updatedUrl).build()
                    } else {
                        originalRequest
                    }
                chain.proceed(updatedRequest)
            }.addInterceptor(
                HttpLoggingInterceptor().apply {
                    level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.BASIC
                },
            ).build()

    val apiService: ChampagneApiService = ApiServiceFactory.create(BuildConfig.API_BASE_URL, client)
}
