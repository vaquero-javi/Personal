package com.example.ptdapp.ui.screens.detailPTDScreen.gastos

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.ptdapp.ui.components.CustomCardGasto
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.example.ptdapp.ui.navigation.Destinations
import com.example.ptdapp.ui.theme.Gray
import com.example.ptdapp.ui.theme.OpenSansSemiCondensed


@Composable
fun GastosContent(
    grupoId: String,
    navController: NavHostController,
    gastosViewModel: GastosViewModel = viewModel()
) {
    val gastos by gastosViewModel.gastos.collectAsState()

    LaunchedEffect(grupoId) {
        gastosViewModel.cargarGastos(grupoId)
    }

    if (gastos.isEmpty()) {
        // Mostrar mensaje si no hay gastos
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "Aún no se han registrado gastos en este grupo.",
                fontSize = 18.sp,
                fontFamily = OpenSansSemiCondensed,
                color = Gray

            )
        }
    } else {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(gastos) { gasto ->
                val fecha = gasto.fecha ?: Date()
                val dia = SimpleDateFormat("dd", Locale.getDefault()).format(fecha)
                val mes = SimpleDateFormat("MMM", Locale("es")).format(fecha).replaceFirstChar { it.uppercase() }
                val anio = SimpleDateFormat("yyyy", Locale.getDefault()).format(fecha)
                val formattedDate = "$dia $mes. $anio"

                CustomCardGasto(
                    fecha = formattedDate,
                    nombreGasto = gasto.titulo,
                    precioGasto = String.format("%.2f", gasto.cantidad),
                    iconoNombre = gasto.iconoNombre,
                    onClick = {
                        navController.navigate(Destinations.detailGastoRoute(grupoId, gasto.id))
                    }
                )
            }
        }
    }
}

