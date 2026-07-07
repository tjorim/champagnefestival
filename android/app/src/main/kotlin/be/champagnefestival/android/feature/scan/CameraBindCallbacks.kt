package be.champagnefestival.android.feature.scan

import androidx.camera.core.Camera

/** Callbacks fired while binding the camera preview to a lifecycle. */
internal class CameraBindCallbacks(
    val onCameraBound: (Camera) -> Unit,
    val onQrDetected: (String) -> Unit,
    val onError: (Throwable) -> Unit
)
