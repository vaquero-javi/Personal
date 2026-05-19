package com.example.ptdapp.ui.screens.detailGastoScreen

import android.icu.text.SimpleDateFormat
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ptdapp.R
import com.example.ptdapp.data.model.Gasto
import com.example.ptdapp.data.repositories.UserRepository
import com.example.ptdapp.ui.components.CustomCardSaldo
import com.example.ptdapp.ui.theme.BlueLight
import com.example.ptdapp.ui.theme.OpenSansNormal
import com.example.ptdapp.ui.theme.OpenSansSemiCondensed
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import java.util.Locale
import androidx.compose.foundation.lazy.items
import androidx.compose.ui.text.TextStyle
import com.example.ptdapp.ui.theme.Gray
import com.example.ptdapp.ui.theme.LightBlue
import com.example.ptdapp.ui.theme.OpenSauce

@Composable
fun DetailGastoScreen(
    grupoId: String,
    gastoId: String,
    navController: NavHostController
) {
    val context = LocalContext.current
    val db = FirebaseFirestore.getInstance()
    var gasto by remember { mutableStateOf<Gasto?>(null) }
    var nombres by remember { mutableStateOf<Map<String, String>>(emptyMap()) }

    val iconResId = remember(gasto?.iconoNombre) {
        context.resources.getIdentifier(gasto?.iconoNombre ?: "image", "drawable", context.packageName)
    }

    // Carga el gasto
    LaunchedEffect(gastoId, grupoId) {
        val doc = db.collection("grupos").document(grupoId)
            .collection("gastos").document(gastoId).get().await()
        gasto = doc.toObject(Gasto::class.java)

        gasto?.let {
            UserRepository.getUserNamesByUids(it.divididoEntre + it.pagadoPor) { nombresMap ->
                nombres = nombresMap
            }
        }
    }

    gasto?.let { g ->
        val fechaFormateada = remember(g.fecha) {
            g.fecha?.let {
                SimpleDateFormat("d  'de' MMMM, yyyy", Locale("es")).format(it)
            } ?: ""
        }

        val cantidadPorPersona = if (g.divididoEntre.isNotEmpty()) g.cantidad / g.divididoEntre.size else 0.0

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
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
                    contentDescription = "Volver",
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

            // Título e icono
            Text(
                text = g.titulo,
                fontSize = 35.sp,
                fontFamily = OpenSansSemiCondensed,
                fontWeight = FontWeight.Bold,
                color = Color.Black
            )

            Icon(
                painter = painterResource(id = iconResId),
                contentDescription = "Icono del gasto",
                modifier = Modifier.size(130.dp),
                tint = Gray
            )

            Text(
                text = fechaFormateada,
                fontSize = 18.sp,
                fontFamily = OpenSauce,
                color = Color.Black
            )
            Spacer(Modifier.height(12.dp))

            // Pagado por
            Text(
                text = "Pagado por:",
                fontSize = 21.sp,
                fontFamily = OpenSauce,
                color = Color.Black,
                modifier = Modifier.align(Alignment.Start).padding(start=10.dp)
            )

            CustomCardSaldo(
                nombrePersona = nombres[g.pagadoPor] ?: g.pagadoPor,
                gastoPersona = String.format("%.2f", g.cantidad)
            )

            Spacer(Modifier.height(12.dp))


            // Dividido entre
            Text(
                text = "A dividir entre:",
                fontSize = 21.sp,
                fontFamily = OpenSauce,
                color = Color.Black,
                modifier = Modifier.align(Alignment.Start).padding(start=10.dp)
            )

            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(g.divididoEntre) { uid ->
                    CustomCardSaldo(
                        nombrePersona = nombres[uid] ?: uid,
                        gastoPersona = String.format("%.2f", cantidadPorPersona)
                    )
                }
            }
        }
    } ?: run {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = BlueLight)
        }
    }
}