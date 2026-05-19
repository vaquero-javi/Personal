package com.example.ptdapp.ui.screens.detailPTDScreen

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ptdapp.R
import com.example.ptdapp.data.model.PTDGroup
import com.example.ptdapp.data.repositories.UserRepository
import com.example.ptdapp.ui.components.LogoSpinner
import com.example.ptdapp.ui.navigation.Destinations
import com.example.ptdapp.ui.theme.BlueLight
import com.example.ptdapp.ui.theme.LightBlue
import com.example.ptdapp.ui.theme.OpenSansNormal
import com.example.ptdapp.ui.theme.OpenSansSemiCondensed
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.ptdapp.ui.liquidacionViewModel.LiquidacionEstado
import com.example.ptdapp.ui.liquidacionViewModel.LiquidacionViewModel
import com.example.ptdapp.ui.screens.detailPTDScreen.gastos.GastosContent
import com.example.ptdapp.ui.screens.detailPTDScreen.saldos.SaldosContent
import com.google.firebase.auth.FirebaseAuth


@Composable
fun DetailPTDScreen(
    grupoId: String,
    navController: NavHostController
) {
    val context = LocalContext.current
    var grupo by remember { mutableStateOf<PTDGroup?>(null) }
    var selectedTab by remember { mutableStateOf("Gastos") }
    var nombreUsuarios by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    val currentUserUid = FirebaseAuth.getInstance().currentUser?.uid

    val liquidacionViewModel: LiquidacionViewModel = viewModel()
    val estadoLiquidacion by liquidacionViewModel.estadoLiquidacion.collectAsState()

    var showLiquidarDialog by remember { mutableStateOf(false) }

    LaunchedEffect(grupoId) {
        Firebase.firestore.collection("grupos").document(grupoId)
            .get()
            .addOnSuccessListener { doc ->
                grupo = doc.toObject(PTDGroup::class.java)?.also { g ->
                    UserRepository.getUserNamesByUids(g.miembros) { nombresMap ->
                        nombreUsuarios = nombresMap
                    }
                }
            }
    }

    LaunchedEffect(estadoLiquidacion) {
        when (estadoLiquidacion) {
            LiquidacionEstado.Success -> {
                Toast.makeText(context, "Deudas liquidadas correctamente", Toast.LENGTH_SHORT).show()
                navController.popBackStack()
                liquidacionViewModel.resetEstado()
            }

            is LiquidacionEstado.Error -> {
                Toast.makeText(context, (estadoLiquidacion as LiquidacionEstado.Error).mensaje, Toast.LENGTH_SHORT).show()
                liquidacionViewModel.resetEstado()
            }

            else -> {}
        }
    }

    grupo?.let { g ->
        val iconResId = remember(g.iconoNombre) {
            context.resources.getIdentifier(g.iconoNombre, "drawable", context.packageName)
        }

        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp)
            ) {
                // Botón atrás
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { navController.popBackStack() }
                ) {
                    Icon(
                        painterResource(R.drawable.arrow_back_ios),
                        contentDescription = "Cancelar",
                        modifier = Modifier.size(24.dp),
                        tint = BlueLight
                    )
                    Text(
                        "Inicio",
                        style = TextStyle(
                            fontSize = 20.sp,
                            fontFamily = OpenSansNormal,
                            fontWeight = FontWeight.Bold,
                            color = BlueLight
                        )
                    )
                }

                Spacer(Modifier.height(12.dp))

                Icon(
                    painterResource(iconResId),
                    contentDescription = "Icono grupo",
                    modifier = Modifier
                        .size(150.dp)
                        .align(Alignment.CenterHorizontally),
                    tint = LightBlue
                )

                Spacer(Modifier.height(12.dp))

                Text(
                    text = g.nombre,
                    style = TextStyle(
                        fontSize = 28.sp,
                        fontFamily = OpenSansSemiCondensed,
                        fontWeight = FontWeight.Bold,
                        color = Color.Black
                    ),
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                )

                Spacer(Modifier.height(12.dp))

                // Código del grupo
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Código del grupo: ${g.id}",
                        style = TextStyle(
                            fontSize = 14.sp,
                            fontFamily = OpenSansNormal,
                            color = Color.Gray
                        )
                    )

                    Spacer(modifier = Modifier.width(8.dp))

                    val clipboardManager =
                        LocalContext.current.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

                    IconButton(onClick = {
                        val clip = ClipData.newPlainText("Código del grupo", g.id)
                        clipboardManager.setPrimaryClip(clip)
                        Toast.makeText(context, "Código copiado", Toast.LENGTH_SHORT).show()
                    }) {
                        Icon(
                            painterResource(R.drawable.content_copy),
                            contentDescription = "Copiar código",
                            tint = BlueLight
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                // Selector de pestañas
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(LightBlue),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    listOf("Gastos", "Saldos").forEach { tab ->
                        val selected = selectedTab == tab
                        Box(
                            modifier = Modifier
                                .weight(0.5f)
                                .fillMaxHeight()
                                .padding(3.dp)
                                .clip(RoundedCornerShape(6.dp))
                                .background(if (selected) BlueLight else Color.Transparent)
                                .clickable { selectedTab = tab },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = tab,
                                style = TextStyle(
                                    fontSize = 15.sp,
                                    fontFamily = OpenSansSemiCondensed,
                                    color = if (selected) Color.White else Color.Black
                                )
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                when (selectedTab) {
                    "Gastos" -> GastosContent(grupoId, navController)
                    "Saldos" -> SaldosContent(grupoId = grupoId, miembros = g.miembros)
                }
            }

            if (selectedTab == "Gastos") {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(20.dp)
                ) {
                    IconButton(
                        onClick = { navController.navigate(Destinations.createGastoRoute(grupoId)) },
                        modifier = Modifier.size(60.dp)
                            .background(Color.Transparent)
                    ) {
                        Icon(
                            painterResource(R.drawable.add_circle),
                            contentDescription = "Añadir",
                            modifier = Modifier.size(60.dp),
                            tint = BlueLight
                        )
                    }
                    Text(
                        "Crear gasto",
                        style = TextStyle(fontFamily = OpenSansSemiCondensed, fontSize = 13.sp, color = BlueLight)
                    )
                }
            } else if (g.adminId == currentUserUid) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 20.dp, bottom = 20.dp)
                ) {
                    IconButton(
                        onClick = { showLiquidarDialog = true },
                        modifier = Modifier.size(60.dp)
                            .background(Color.Transparent)
                    ) {
                        Icon(
                            painterResource(R.drawable.shopping_cart_checkout),
                            contentDescription = "Liquidar deudas",
                            modifier = Modifier.size(60.dp),
                            tint = BlueLight
                        )
                    }
                    Text(
                        "Liquidar deudas",
                        style = TextStyle(fontFamily = OpenSansSemiCondensed, fontSize = 13.sp, color = BlueLight)
                    )
                }
            }

            if (showLiquidarDialog) {
                AlertDialog(
                    onDismissRequest = { showLiquidarDialog = false },
                    confirmButton = {
                        TextButton(onClick = {
                            liquidacionViewModel.liquidarGrupo(grupoId)
                            showLiquidarDialog = false
                        }) {
                            Text("Confirmar", style = TextStyle(fontFamily = OpenSansSemiCondensed, fontSize = 18.sp, color = BlueLight))
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showLiquidarDialog = false }) {
                            Text("Cancelar", style = TextStyle(fontFamily = OpenSansSemiCondensed, fontSize = 18.sp, color = BlueLight))
                        }
                    },
                    title = { Text("Alerta!", style = TextStyle(fontSize = 25.sp, color = Color.Red, fontFamily = OpenSansSemiCondensed)) },
                    text = { Text("Si saldas las deudas de este grupo ya no se podrán editar posteriormente y se archivará.", textAlign = TextAlign.Justify, fontFamily = OpenSansSemiCondensed, fontSize = 18.sp) }
                )
            }
        }
    } ?: Box(Modifier.fillMaxSize(), Alignment.Center) {
        LogoSpinner()
    }
}








