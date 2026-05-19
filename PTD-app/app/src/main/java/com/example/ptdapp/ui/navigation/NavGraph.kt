package com.example.ptdapp.ui.navigation


import android.app.Activity
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.example.ptdapp.ui.screens.createGastoScreen.CreateGastoScreen
import com.example.ptdapp.ui.screens.createPTDScreen.CreatePTDScreen
import com.example.ptdapp.ui.screens.detailGastoScreen.DetailGastoScreen
import com.example.ptdapp.ui.screens.detailPTDScreen.DetailPTDScreen
import com.example.ptdapp.ui.screens.homeScreen.HomeScreen
import com.example.ptdapp.ui.screens.loginScreen.LoginScreen
import com.example.ptdapp.ui.screens.mainScreen.MainScreen
import com.example.ptdapp.ui.screens.notificationScreen.NotificationScreen
import com.example.ptdapp.ui.screens.profileScreen.ProfileScreen
import com.example.ptdapp.ui.screens.registerScreen.RegisterScreen
import com.example.ptdapp.ui.screens.walletScreen.WalletScreen
import com.example.ptdapp.ui.authViewmodel.AuthViewModel
import com.example.ptdapp.ui.authViewmodel.AuthViewModelFactory
import com.example.ptdapp.ui.screens.walletScreen.WalletViewModel
import androidx.navigation.NavType
import androidx.navigation.navArgument
import com.example.ptdapp.ui.screens.detailPTDScreen.saldos.SaldoViewModel


@Composable
fun NavGraph(
    navController: NavHostController,
    walletViewModel: WalletViewModel,
    saldoViewModel:  SaldoViewModel
) {
    /* ----------  ViewModels raíz  ---------- */
    val authViewModel: AuthViewModel = viewModel(factory = AuthViewModelFactory())

    /* ----------  Sincronizar flujos  ---------- */
    LaunchedEffect(Unit) {
        walletViewModel.setFlujosDeudas(
            flujoDebes   = saldoViewModel.debes,
            flujoTeDeben = saldoViewModel.teDeben
        )
    }
    /* (cargarTotalesGlobales() ya no se llama; el VM se actualiza solo) */

    /* ----------  Pantalla inicial  ---------- */
    val user by authViewModel.user.collectAsState()
    val startDestination =
        if (user != null) Destinations.MAIN_SCREEN else Destinations.LOGIN_SCREEN

    /* ----------  NavHost  ---------- */
    NavHost(navController, startDestination) {

        composable(Destinations.LOGIN_SCREEN)    { LoginScreen(navController, authViewModel) }
        composable(Destinations.REGISTER_SCREEN) { RegisterScreen(navController, authViewModel) }

        composable(Destinations.MAIN_SCREEN) {
            MainScreen(navController, walletViewModel, saldoViewModel)
        }

        composable(
            route = Destinations.CREATE_GASTO_SCREEN,
            arguments = listOf(navArgument("grupoId") { type = NavType.StringType })
        ) { back ->
            CreateGastoScreen(
                navController,
                back.arguments?.getString("grupoId") ?: return@composable
            )
        }

        composable(Destinations.CREATE_PTD_SCREEN) { CreatePTDScreen(navController) }

        composable(
            route = Destinations.DETAIL_GASTO_SCREEN,
            arguments = listOf(
                navArgument("grupoId") { type = NavType.StringType },
                navArgument("gastoId") { type = NavType.StringType }
            )
        ) { back ->
            DetailGastoScreen(
                grupoId       = back.arguments?.getString("grupoId") ?: return@composable,
                gastoId       = back.arguments?.getString("gastoId") ?: return@composable,
                navController = navController
            )
        }

        composable(Destinations.HOME_SCREEN)         { HomeScreen(navController) }
        composable(Destinations.NOTIFICATION_SCREEN) { NotificationScreen(navController) }
        composable(Destinations.PROFILE_SCREEN)      { ProfileScreen(navController, authViewModel) }

        composable(Destinations.WALLET_SCREEN) {
            WalletScreen(navController, walletViewModel, saldoViewModel)
        }

        composable(
            route = Destinations.DETAIL_PTD_SCREEN,
            arguments = listOf(navArgument("ptdId") { type = NavType.StringType })
        ) { back ->
            DetailPTDScreen(
                navController = navController,
                grupoId       = back.arguments?.getString("ptdId") ?: return@composable
            )
        }
    }

    /* ----------  Logout → limpia NavHost y VMs  ---------- */
    LaunchedEffect(user) {
        if (user == null) {
            navController.navigate(Destinations.LOGIN_SCREEN) {
                popUpTo(0) { inclusive = true }   // borra pila + ViewModelStore
            }
        }
    }
}


