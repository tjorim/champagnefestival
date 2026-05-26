package be.champagnefestival.android.core.network

import be.champagnefestival.android.BuildConfig
import be.champagnefestival.android.core.storage.SessionDataStore
import be.champagnefestival.android.data.api.ChampagneApiService
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

class NetworkModule(sessionDataStore: SessionDataStore) {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val client = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val originalRequest = chain.request()
            val overrideBaseUrl = runBlocking { sessionDataStore.apiBaseUrlFlow.filterNotNull().first() }
            val overrideBase = overrideBaseUrl.toHttpUrlOrNull()
            val updatedRequest = if (overrideBase != null) {
                val updatedUrl = originalRequest.url.newBuilder()
                    .scheme(overrideBase.scheme)
                    .host(overrideBase.host)
                    .port(overrideBase.port)
                    .build()
                originalRequest.newBuilder().url(updatedUrl).build()
            } else {
                originalRequest
            }
            chain.proceed(updatedRequest)
        }
        .addInterceptor(
            HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.BASIC
            },
        )
        .build()

    private val retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    val apiService: ChampagneApiService = retrofit.create(ChampagneApiService::class.java)
}
