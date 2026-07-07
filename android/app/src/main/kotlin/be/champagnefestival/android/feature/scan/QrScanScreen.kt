package be.champagnefestival.android.feature.scan

import android.Manifest
import android.content.Context
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Keyboard
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import be.champagnefestival.android.R
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QrScanScreen(
    viewModel: QrScanViewModel,
    onBack: () -> Unit,
    onRegistrationScanned: (String, String) -> Unit,
    onManualEntrySubmitted: (String, String) -> Unit
) {
    val context = LocalContext.current
    val view = LocalView.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val errorMessage by viewModel.errorMessage.collectAsState()
    val invalidQrMessage = stringResource(R.string.scan_invalid_qr_message)
    val cameraStartErrorMessage = stringResource(R.string.scan_camera_start_error)
    val snackbarHostState = remember { SnackbarHostState() }
    var cameraPermissionGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        )
    }
    var hasNavigated by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var previewView by remember { mutableStateOf<PreviewView?>(null) }
    var torchOn by remember { mutableStateOf(false) }
    var showManualEntry by remember { mutableStateOf(false) }
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember { BarcodeScanning.getClient() }
    val permissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            cameraPermissionGranted = granted
        }

    DisposableEffect(Unit) {
        view.keepScreenOn = true
        onDispose {
            view.keepScreenOn = false
            scanner.close()
            cameraExecutor.shutdown()
        }
    }

    LaunchedEffect(errorMessage) {
        errorMessage?.let {
            context.vibrateError()
            snackbarHostState.showSnackbar(it)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.scan_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.back_content_description)
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { showManualEntry = true }) {
                        Icon(
                            Icons.Default.Keyboard,
                            contentDescription = stringResource(R.string.scan_manual_entry_button)
                        )
                    }
                    if (camera?.cameraInfo?.hasFlashUnit() == true) {
                        IconButton(
                            onClick = {
                                torchOn = !torchOn
                                camera?.cameraControl?.enableTorch(torchOn)
                            }
                        ) {
                            Icon(
                                imageVector = if (torchOn) Icons.Default.FlashOn else Icons.Default.FlashOff,
                                contentDescription = stringResource(
                                    if (torchOn) R.string.scan_torch_turn_off else R.string.scan_torch_turn_on
                                )
                            )
                        }
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        if (!cameraPermissionGranted) {
            Column(
                modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(stringResource(R.string.scan_camera_permission_rationale))
                Button(
                    onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                    modifier = Modifier.padding(top = 16.dp)
                ) {
                    Text(stringResource(R.string.scan_grant_camera_button))
                }
            }
        } else {
            Box(
                modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .pointerInput(camera, previewView) {
                        detectTapGestures { offset ->
                            val boundCamera = camera
                            val boundPreviewView = previewView
                            if (boundCamera != null && boundPreviewView != null) {
                                val meteringPoint =
                                    boundPreviewView.meteringPointFactory.createPoint(offset.x, offset.y)
                                val meteringFlags = FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE
                                val action =
                                    FocusMeteringAction
                                        .Builder(meteringPoint, meteringFlags)
                                        .setAutoCancelDuration(3, TimeUnit.SECONDS)
                                        .build()
                                boundCamera.cameraControl.startFocusAndMetering(action)
                            }
                        }
                    }
            ) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { previewContext ->
                        PreviewView(previewContext).apply {
                            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                            scaleType = PreviewView.ScaleType.FILL_CENTER
                            previewView = this
                            bindCamera(
                                lifecycleOwner = lifecycleOwner,
                                scanner = scanner,
                                executor = cameraExecutor,
                                callbacks =
                                CameraBindCallbacks(
                                    onCameraBound = { boundCamera -> camera = boundCamera },
                                    onQrDetected = { rawValue ->
                                        if (!hasNavigated) {
                                            val parsed = viewModel.parseQrPayload(rawValue, invalidQrMessage)
                                            if (parsed != null) {
                                                hasNavigated = true
                                                context.vibrateSuccess()
                                                onRegistrationScanned(parsed.first, parsed.second)
                                            }
                                        }
                                    },
                                    onError = { throwable ->
                                        viewModel.reportError(throwable.message ?: cameraStartErrorMessage)
                                    }
                                )
                            )
                        }
                    }
                )
                Box(
                    modifier =
                    Modifier
                        .align(Alignment.Center)
                        .fillMaxWidth(0.7f)
                        .height(220.dp)
                        .border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(20.dp))
                        .background(Color.Transparent)
                )
                Text(
                    text = stringResource(R.string.scan_frame_instruction),
                    modifier =
                    Modifier
                        .align(Alignment.BottomCenter)
                        .padding(24.dp)
                        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.9f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                )
            }
        }
    }

    if (showManualEntry) {
        ManualEntryDialog(
            onDismiss = { showManualEntry = false },
            onSubmit = { registrationId, token ->
                showManualEntry = false
                hasNavigated = true
                onManualEntrySubmitted(registrationId, token)
            }
        )
    }
}

@Composable
private fun ManualEntryDialog(onDismiss: () -> Unit, onSubmit: (String, String) -> Unit) {
    var registrationId by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.scan_manual_entry_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(R.string.scan_manual_entry_description))
                OutlinedTextField(
                    value = registrationId,
                    onValueChange = { registrationId = it },
                    label = { Text(stringResource(R.string.scan_manual_entry_id_label)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = token,
                    onValueChange = { token = it },
                    label = { Text(stringResource(R.string.scan_manual_entry_token_label)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSubmit(registrationId.trim(), token.trim()) },
                enabled = registrationId.isNotBlank() && token.isNotBlank()
            ) {
                Text(stringResource(R.string.scan_manual_entry_submit))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.scan_manual_entry_cancel))
            }
        }
    )
}

private fun Context.vibrateSuccess() {
    val vibrator = getSystemService(Vibrator::class.java) ?: return
    vibrator.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
}

private fun Context.vibrateError() {
    val vibrator = getSystemService(Vibrator::class.java) ?: return
    vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 60, 80, 60), -1))
}

@androidx.annotation.OptIn(ExperimentalGetImage::class)
private fun PreviewView.bindCamera(
    lifecycleOwner: androidx.lifecycle.LifecycleOwner,
    scanner: BarcodeScanner,
    executor: java.util.concurrent.Executor,
    callbacks: CameraBindCallbacks
) {
    val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
    cameraProviderFuture.addListener(
        {
            runCatching {
                val cameraProvider = cameraProviderFuture.get()
                val preview = Preview.Builder().build().also { it.surfaceProvider = surfaceProvider }
                val analysis =
                    ImageAnalysis
                        .Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                        .also { imageAnalysis ->
                            imageAnalysis.setAnalyzer(executor) { imageProxy ->
                                val mediaImage = imageProxy.image
                                if (mediaImage == null) {
                                    imageProxy.close()
                                    return@setAnalyzer
                                }
                                val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                                scanner
                                    .process(image)
                                    .addOnSuccessListener { barcodes ->
                                        barcodes
                                            .firstOrNull { it.format == Barcode.FORMAT_QR_CODE }
                                            ?.rawValue
                                            ?.let(callbacks.onQrDetected)
                                    }.addOnFailureListener(callbacks.onError)
                                    .addOnCompleteListener { imageProxy.close() }
                            }
                        }
                cameraProvider.unbindAll()
                val camera =
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        analysis
                    )
                callbacks.onCameraBound(camera)
            }.onFailure(callbacks.onError)
        },
        ContextCompat.getMainExecutor(context)
    )
}
