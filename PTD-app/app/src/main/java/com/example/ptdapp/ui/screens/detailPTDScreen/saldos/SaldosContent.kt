package com.example.ptdapp.ui.screens.detailPTDScreen.saldos

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.ptdapp.ui.components.CustomCardSaldo
import com.example.ptdapp.ui.theme.OpenSansSemiCondensed
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.*
import androidx.compose.material3.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.TextStyle
import com.example.ptdapp.ui.components.CustomCardSaldoPersonal
import com.example.ptdapp.ui.components.LogoSpinner
import com.example.ptdapp.ui.theme.Gray
import com.google.firebase.auth.FirebaseAuth


@Composable
fun SaldosContent(
    grupoId: String,
    miembros: List<String>,
    saldoViewModel: SaldoViewModel = viewModel()
) {
    val saldos by saldoViewModel.saldos.collectAsState()
    val nombres by saldoViewModel.nombreUsuarios.collectAsState()
    val isDataLoaded by saldoViewModel.isDataLoaded.collectAsState()

    val currentUid = FirebaseAuth.getInstance().currentUser?.uid

    LaunchedEffect(grupoId, miembros) {
        if (miembros.isNotEmpty()) {
            saldoViewModel.calcularSaldo(grupoId)
            saldoViewModel.obtenerNombresUsuarios(miembros)
        }
    }

    if (!isDataLoaded || nombres.size < miembros.size) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            LogoSpinner()
        }
    } else if (saldos.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "Todavía no hay gastos en este grupo.",
                style = TextStyle(
                    fontSize = 18.sp,
                    fontFamily = OpenSansSemiCondensed,
                    color = Gray
                )
            )
        }
    } else {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp),
        ) {
            // Tu saldo
            CustomCardSaldoPersonal(
                gastoPersona = String.format("%.2f", saldos[currentUid] ?: 0.0)
            )

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = "Saldos",
                style = TextStyle(
                    fontSize = 20.sp,
                    fontFamily = OpenSansSemiCondensed,
                    color = MaterialTheme.colorScheme.onBackground
                )
            )

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(miembros.filter { it != currentUid }) { uid ->
                    val nombre = nombres[uid] ?: uid
                    val saldo = saldos[uid] ?: 0.0

                    CustomCardSaldo(
                        nombre,
                        gastoPersona = String.format("%.2f", saldo)
                    )
                }
            }
        }
    }
}







