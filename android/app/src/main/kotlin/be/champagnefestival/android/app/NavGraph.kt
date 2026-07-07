package be.champagnefestival.android.app

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import be.champagnefestival.android.ChampagneFestivalApp
import be.champagnefestival.android.core.di.simpleFactory
import be.champagnefestival.android.feature.edition.ActiveEditionScreen
import be.champagnefestival.android.feature.edition.ActiveEditionViewModel
import be.champagnefestival.android.feature.login.LoginScreen
import be.champagnefestival.android.feature.login.LoginViewModel
import be.champagnefestival.android.feature.lookup.GuestLookupScreen
import be.champagnefestival.android.feature.lookup.GuestLookupViewModel
import be.champagnefestival.android.feature.registration.CheckInConfirmationScreen
import be.champagnefestival.android.feature.registration.CheckInViewModel
import be.champagnefestival.android.feature.registration.RegistrationDetailScreen
import be.champagnefestival.android.feature.registration.RegistrationDetailViewModel
import be.champagnefestival.android.feature.scan.QrScanScreen
import be.champagnefestival.android.feature.scan.QrScanViewModel
import be.champagnefestival.android.feature.settings.SettingsScreen
import be.champagnefestival.android.feature.settings.SettingsViewModel

private object Routes {
    const val Login = "login"
    const val Edition = "edition"
    const val Scan = "scan"
    const val Lookup = "lookup"
    const val Registration = "registration/{id}/{token}"
    const val CheckInConfirm = "checkin_confirm/{id}/{token}"
    const val Settings = "settings"
}

@Composable
fun NavGraph(app: ChampagneFestivalApp, modifier: Modifier = Modifier) {
    val navController = rememberNavController()
    val startDestination = if (app.authManager.isLoggedIn()) Routes.Edition else Routes.Login

    NavHost(navController = navController, startDestination = startDestination, modifier = modifier) {
        composable(Routes.Login) {
            val viewModel: LoginViewModel = viewModel(factory = simpleFactory { LoginViewModel(app.authManager) })
            LoginScreen(
                viewModel = viewModel,
                onLoggedIn = {
                    navController.navigate(Routes.Edition) {
                        popUpTo(Routes.Login) { inclusive = true }
                    }
                },
                onOpenSettings = { navController.navigate(Routes.Settings) }
            )
        }
        composable(Routes.Edition) {
            val viewModel: ActiveEditionViewModel =
                viewModel(
                    factory =
                    simpleFactory {
                        ActiveEditionViewModel(app.editionRepository, app.authManager::getAccessToken)
                    }
                )
            ActiveEditionScreen(
                viewModel = viewModel,
                onOpenScan = { navController.navigate(Routes.Scan) },
                onOpenLookup = { navController.navigate(Routes.Lookup) },
                onOpenSettings = { navController.navigate(Routes.Settings) }
            )
        }
        composable(Routes.Scan) {
            val viewModel: QrScanViewModel = viewModel(factory = simpleFactory { QrScanViewModel() })
            QrScanScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onRegistrationScanned = { registrationId, token ->
                    // Fast lane: scanning a wristband checks the guest in immediately, without
                    // an intermediate review tap, since that's the common case in a busy line.
                    navController.navigate("checkin_confirm/${Uri.encode(registrationId)}/${Uri.encode(token)}")
                },
                onManualEntrySubmitted = { registrationId, token ->
                    // Manual entry is the exception path (damaged/unscannable code), so route
                    // through the detail screen for a review step before checking in.
                    navController.navigate("registration/${Uri.encode(registrationId)}/${Uri.encode(token)}")
                }
            )
        }
        composable(Routes.Lookup) {
            val viewModel: GuestLookupViewModel =
                viewModel(
                    factory =
                    simpleFactory {
                        GuestLookupViewModel(
                            repository = app.checkInRepository,
                            authTokenProvider = app.authManager::getAccessToken
                        )
                    }
                )
            GuestLookupScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() }
            )
        }
        composable(
            route = Routes.Registration,
            arguments =
            listOf(
                navArgument("id") { type = NavType.StringType },
                navArgument("token") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val id = Uri.decode(backStackEntry.arguments?.getString("id").orEmpty())
            val token = Uri.decode(backStackEntry.arguments?.getString("token").orEmpty())
            val viewModel: RegistrationDetailViewModel =
                viewModel(
                    factory = simpleFactory { RegistrationDetailViewModel(app.checkInRepository) }
                )
            RegistrationDetailScreen(
                id = id,
                token = token,
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onCheckIn = { regId, regToken ->
                    navController.navigate("checkin_confirm/${Uri.encode(regId)}/${Uri.encode(regToken)}")
                }
            )
        }
        composable(
            route = Routes.CheckInConfirm,
            arguments =
            listOf(
                navArgument("id") { type = NavType.StringType },
                navArgument("token") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val id = Uri.decode(backStackEntry.arguments?.getString("id").orEmpty())
            val token = Uri.decode(backStackEntry.arguments?.getString("token").orEmpty())
            val viewModel: CheckInViewModel =
                viewModel(
                    factory =
                    simpleFactory {
                        CheckInViewModel(app.checkInRepository, app.connectivityObserver, app.pendingCheckInStore)
                    }
                )
            CheckInConfirmationScreen(
                id = id,
                token = token,
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onDone = {
                    // Return to the scanner (skipping any intermediate review/detail screen) so
                    // staff can keep processing the next guest in line without extra taps.
                    navController.popBackStack(Routes.Scan, false)
                }
            )
        }
        composable(Routes.Settings) {
            val viewModel: SettingsViewModel =
                viewModel(
                    factory =
                    simpleFactory {
                        SettingsViewModel(
                            app.apiBaseUrlOverrideStore,
                            app.biometricLockPreferencesStore,
                            app.authManager
                        )
                    }
                )
            SettingsScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onLoggedOut = {
                    navController.navigate(Routes.Login) {
                        popUpTo(Routes.Edition) { inclusive = true }
                    }
                }
            )
        }
    }
}
