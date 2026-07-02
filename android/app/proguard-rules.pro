# Retrofit and OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class retrofit2.** { *; }
-keepattributes Signature, InnerClasses, EnclosingMethod

# Kotlinx serialization
-keep class kotlinx.serialization.** { *; }
-keepclassmembers class **$$serializer { *; }
-keepclassmembers class * {
    @kotlinx.serialization.Serializable *;
}

# AppAuth
-dontwarn net.openid.appauth.**
-keep class net.openid.appauth.** { *; }

# Keep model classes used by serialization
-keep class be.champagnefestival.android.data.model.** { *; }
