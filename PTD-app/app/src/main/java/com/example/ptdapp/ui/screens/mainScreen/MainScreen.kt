package com.example.ptdapp.ui.screens.mainScreen

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.example.ptdapp.R
import com.example.ptdapp.ui.navigation.Destinations
import com.example.ptdapp.ui.screens.detailPTDScreen.saldos.SaldoViewModel
import com.example.ptdapp.ui.screens.homeScreen.HomeScreen
import com.example.ptdapp.ui.screens.notificationScreen.NotificationScreen
import com.example.ptdapp.ui.screens.notificationScreen.NotificationsViewModel
import com.example.ptdapp.ui.screens.walletScreen.WalletScreen
import com.example.ptdapp.ui.screens.walletScreen.WalletViewModel
import com.example.ptdapp.ui.theme.BlueLight
import com.example.ptdapp.ui.theme.Gray
import com.example.ptdapp.ui.theme.LightBlue
import com.example.ptdapp.ui.theme.LightGray
import com.example.ptdapp.ui.theme.OpenSansNormal
import com.example.ptdapp.ui.theme.OpenSansSemiCondensed
import com.example.ptdapp.ui.theme.SoftRed


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    navController: NavHostController,
    walletViewModel: WalletViewModel,
    saldoViewModel:  SaldoViewModel
) {
    val items = listOf(BottomNavItem.Wallet, BottomNavItem.Home, BottomNavItem.Notifications)
    var selectedItem by remember { mutableStateOf(BottomNavItem.Home.route) } // Guardar la ruta en String
    val notificationsViewModel: NotificationsViewModel = viewModel()
    val hasUnread by notificationsViewModel.hasUnread.collectAsState()


    Scaffold(
        topBar = {
            Column {
                val currentItem = items.find { it.route == selectedItem }
                TopAppBar(
                    title = {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp), // Margen lateral opcional
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                painter = painterResource(
                                    id = currentItem?.icon ?: R.drawable.home
                                ),
                                contentDescription = currentItem?.title,
                                modifier = Modifier.size(42.dp),
                                tint = Gray
                            )
                            Spacer(modifier = Modifier.padding(start = 30.dp)) // Espacio entre icono y texto
                            Text(
                                text = currentItem?.title ?: "App",
                                style = TextStyle(
                                    fontFamily = OpenSansNormal,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 22.sp,
                                    color = Color.Black
                                )
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.White
                    ),
                    actions = {
                        Row(
                            modifier = Modifier.padding(horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            IconButton(onClick = { navController.navigate(Destinations.PROFILE_SCREEN) }) {
                                Icon(
                                    painter = painterResource(id = R.drawable.account_circle),
                                    contentDescription = "Perfil",
                                    modifier = Modifier.size(42.dp),
                                    tint = BlueLight
                                )
                            }
                        }
                    }
                )
                HorizontalDivider(color = Gray, thickness = 1.dp) // Línea divisoria marcada
            }
        },
        bottomBar = {
            Column {
                HorizontalDivider(color = Gray, thickness = 1.dp) // Línea divisoria marcada
                NavigationBar(
                    containerColor = Color.White
                ) {
                    items.forEach { item ->
                        NavigationBarItem(
                            selected = selectedItem == item.route, // Comparar con la ruta
                            onClick = {
                                selectedItem = item.route
                            }, // Guardar la ruta al seleccionar
                            icon = {
                                Box(contentAlignment = Alignment.Center,
                                    modifier = Modifier
                                        .clickable(
                                            indication = null,
                                            interactionSource = remember { MutableInteractionSource() }
                                        ) {
                                            selectedItem = item.route
                                        }) {
                                    if (selectedItem == item.route) {
                                        Box(
                                            modifier = Modifier
                                                .size(55.dp)
                                                .background(LightBlue, shape = CircleShape)
                                        )
                                    }

                                    Box {
                                        Icon(
                                            painter = painterResource(id = item.icon),
                                            contentDescription = item.title,
                                            modifier = Modifier.size(38.dp),
                                            tint = Gray
                                        )

                                        if (item.route == BottomNavItem.Notifications.route && hasUnread) {
                                            Box(
                                                modifier = Modifier
                                                    .size(10.dp)
                                                    .align(Alignment.TopEnd)
                                                    .offset(x = 6.dp, y = (-4).dp)
                                                    .background(SoftRed, shape = CircleShape)
                                            )
                                        }
                                    }
                                }
                            },
                            colors = NavigationBarItemDefaults.colors(
                                indicatorColor = Color.Transparent // Se mantiene transparente ya que manejamos el indicador manualmente
                            ),
                        )
                    }
                }
            }
        },
        floatingActionButton = {
            if (selectedItem == BottomNavItem.Home.route) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(10.dp)
                ) {
                    IconButton(
                        onClick = { navController.navigate(Destinations.CREATE_PTD_SCREEN) },
                        modifier = Modifier
                            .size(60.dp)
                            .background(Color.Transparent)
                    ) {
                        Icon(
                            painter = painterResource(id = R.drawable.add_circle),
                            contentDescription = "Añadir",
                            modifier = Modifier.size(60.dp),
                            tint = BlueLight
                        )
                    }
                    Text(
                        text = "Crear PTD",
                        style = TextStyle(
                            fontFamily = OpenSansSemiCondensed,
                            fontSize = 11.sp,
                            color = BlueLight
                        )
                    )
                }
            }
        }


    ) { innerPadding ->
        Box(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
                .background(LightGray)
        ) {
            when (selectedItem) {
                BottomNavItem.Wallet.route -> WalletScreen(
                    navController,
                    walletViewModel,
                    saldoViewModel
                )
                BottomNavItem.Home.route -> HomeScreen(navController)
                BottomNavItem.Notifications.route -> NotificationScreen(navController)
            }
        }
    }
}


sealed class BottomNavItem(val route: String, val title: String, val icon: Int) {
    object Wallet : BottomNavItem("wallet", "Cartera", R.drawable.wallet)
    object Home : BottomNavItem("home", "Inicio", R.drawable.home)
    object Notifications :
        BottomNavItem("notifications", "Notificaciones", R.drawable.notifications)
}
