package com.example.ptdapp.ui.screens.walletScreen

import android.app.Activity
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.ptdapp.data.payment.PaymentRepository
import com.example.ptdapp.ui.components.IngresarButtonComponent
import com.example.ptdapp.ui.components.NumericTextField
import com.example.ptdapp.ui.screens.detailPTDScreen.saldos.SaldoViewModel
import com.example.ptdapp.ui.theme.BlueLight
import com.example.ptdapp.ui.theme.Gray
import com.example.ptdapp.ui.theme.Green
import com.example.ptdapp.ui.theme.OpenSansSemiCondensed
import com.example.ptdapp.ui.theme.OpenSauce


@Composable
fun WalletScreen(
    navController: NavHostController,
    walletViewModel: WalletViewModel,
    saldoViewModel: SaldoViewModel
) {
    var customAmount by remember { mutableStateOf("") }
    val context = LocalContext.current
    val activity = context as Activity
    val paymentRepository = remember { PaymentRepository() }

    val recargaExitosa by walletViewModel.recargaExitosa.collectAsState()
    val saldo by walletViewModel.saldo.collectAsState()

    val scrollState = rememberScrollState()

    val debes    by saldoViewModel.debes.collectAsState()
    val teDeben  by saldoViewModel.teDeben.collectAsState()
    val saldoReal by walletViewModel.saldoReal.collectAsState()

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) {
                walletViewModel.refreshWallet()   // fuerza (re)lectura
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }


    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState) // 👈 Scroll si se necesita
            .imePadding()                // 👈 Mueve el contenido cuando aparece el teclado
            .padding(top = 20.dp, bottom = 32.dp), // 👈 Espacio abajo para evitar que se tape
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        // BOX DEL SALDO
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(150.dp)
                .border(width = 1.dp, color = Gray)
                .background(Color.White)
                .padding(20.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(15.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = formatPrice1(saldo ?: 0.00),
                    style = TextStyle(
                        fontSize = 25.sp,
                        fontFamily = OpenSauce,
                        color = Color.Black
                    )
                )
                Text(
                    text = "Saldo disponible",
                    style = TextStyle(
                        fontSize = 20.sp,
                        fontFamily = OpenSansSemiCondensed,
                        fontWeight = FontWeight.Bold,
                        color = BlueLight
                    )
                )
            }
        }


        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp)
                .border(width = 1.dp, color = Gray)
                .background(Color.White)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .weight(1.5f)
                        .fillMaxWidth()
                        .padding(start = 80.dp, end = 80.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        horizontalAlignment = Alignment.Start
                    ) {
                        Text(
                            text = "Debes",
                            style = TextStyle(
                                fontSize = 20.sp,
                                fontFamily = OpenSansSemiCondensed,
                                fontWeight = FontWeight.Bold,
                                color = Color.Black
                            )
                        )
                    }
                    Column(
                        modifier = Modifier.weight(1f),
                        horizontalAlignment = Alignment.End
                    ) {
                        Text(
                            text = "- ${formatPrice1(debes)}",
                            style = TextStyle(
                                fontSize = 20.sp,
                                fontFamily = OpenSauce,
                                color = Color.Red
                            )
                        )
                    }
                }
                HorizontalDivider(color = Gray, thickness = 1.dp)

                Row(
                    modifier = Modifier
                        .weight(1.5f)
                        .fillMaxWidth()
                        .padding(start = 80.dp, end = 80.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        horizontalAlignment = Alignment.Start
                    ) {
                        Text(
                            text = "Te deben",
                            style = TextStyle(
                                fontSize = 20.sp,
                                fontFamily = OpenSansSemiCondensed,
                                fontWeight = FontWeight.Bold,
                                color = Color.Black
                            )
                        )
                    }
                    Column(
                        modifier = Modifier.weight(1f),
                        horizontalAlignment = Alignment.End
                    ) {
                        Text(
                            text = "+ ${formatPrice1(teDeben)}",
                            style = TextStyle(
                                fontSize = 20.sp,
                                fontFamily = OpenSauce,
                                color = Green
                            )
                        )
                    }
                }

                HorizontalDivider(color = Gray, thickness = 1.dp)

                Row(
                    modifier = Modifier
                        .weight(1.5f)
                        .fillMaxWidth()
                        .padding(start = 80.dp, end = 80.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        horizontalAlignment = Alignment.Start
                    ) {
                        Text(
                            text = "Saldo real",
                            style = TextStyle(
                                fontSize = 20.sp,
                                fontFamily = OpenSansSemiCondensed,
                                fontWeight = FontWeight.Bold,
                                color = Color.Black
                            )
                        )
                    }
                    Column {
                        Text(
                            text = formatPrice1(saldoReal),
                            style = TextStyle(
                                fontSize = 20.sp,
                                fontFamily = OpenSauce,
                                color = Color.Black
                            )
                        )
                    }
                }
            }
        }

        // INGRESO DE DINERO
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(300.dp)
                .border(width = 1.dp, color = Gray)
                .background(Color.White)
                .padding(20.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Ingresar dinero",
                    style = TextStyle(
                        fontSize = 20.sp,
                        fontFamily = OpenSansSemiCondensed,
                        fontWeight = FontWeight.Bold,
                        color = Color.Black
                    )
                )

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    listOf("10", "20", "50").forEach { amount ->
                        Button(
                            onClick = { customAmount = amount },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
                            elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp)
                        ) {
                            Text(
                                text = "$amount €",
                                style = TextStyle(
                                    fontFamily = OpenSauce,
                                    fontSize = 18.sp,
                                    color = BlueLight
                                )
                            )
                        }
                    }
                }

                NumericTextField(
                    label = null,
                    placeholder = "0,00",
                    value = customAmount,
                    onValueChange = { customAmount = it },
                    modifier = Modifier.fillMaxWidth(0.4f)
                )

                IngresarButtonComponent(
                    onIngresarClick = {
                        customAmount.toDoubleOrNull()?.let { amount ->
                            walletViewModel.setPendingAmount(amount)
                            paymentRepository.launchGooglePay(
                                context = context,
                                amount = customAmount,
                                activity = activity
                            )
                        }
                    }
                )

                if (recargaExitosa == true) {
                    LaunchedEffect(recargaExitosa) {
                        Toast.makeText(
                            context,
                            "Ingreso realizado correctamente",
                            Toast.LENGTH_SHORT
                        ).show()
                        walletViewModel.resetearRecarga()
                    }
                }
            }
        }
    }
}


fun formatPrice1(amount: Double): String {
    return String.format("%.2f €", amount)
}



