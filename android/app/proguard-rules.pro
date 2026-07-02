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

# CameraX resolves device-specific workarounds and its config provider via
# reflection; without these rules, R8 shrinking in release builds strips the
# targeted classes and camera binding fails with a null object reference.
-keep class androidx.camera.** { *; }
-dontwarn androidx.camera.**

# ML Kit barcode scanning loads its native/detector implementations via
# reflection at runtime, same issue as above.
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_barcode.** { *; }
-dontwarn com.google.mlkit.**
