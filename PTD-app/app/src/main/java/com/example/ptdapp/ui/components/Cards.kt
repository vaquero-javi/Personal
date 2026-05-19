package com.example.ptdapp.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.TextStyle
import com.example.ptdapp.R
import com.example.ptdapp.ui.theme.OpenSansSemiCondensed
import com.example.ptdapp.ui.theme.OpenSauce
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import com.example.ptdapp.data.model.Notification
import com.example.ptdapp.ui.theme.Green
import com.example.ptdapp.ui.theme.OpenSansNormal
import kotlinx.coroutines.delay


val IconColor = Color(0xFF5F6368)
val CardColor = Color(0xFFA7D8F5)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomCardInicio(
    text: String,
    iconoNombre: String,
    onClick: () -> Unit
) {
    val context = LocalContext.current

    // Convertir el nombre del drawable en ID de recurso
    val iconResId = remember(iconoNombre) {
        context.resources.getIdentifier(iconoNombre, "drawable", context.packageName)
    }

    Card(
        shape = RoundedCornerShape(19.dp),
        colors = CardDefaults.cardColors(containerColor = CardColor),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Start
        ) {
            // Ícono a la izquierda (convertido desde el nombre)
            Icon(
                painter = painterResource(id = iconResId),
                contentDescription = "Ícono del grupo",
                modifier = Modifier.size(43.dp),
                tint = IconColor
            )

            Spacer(modifier = Modifier.width(25.dp))

            Text(
                text = text,
                fontSize = 21.sp,
                fontFamily = OpenSansSemiCondensed,
                color = Color.Black,
                textAlign = TextAlign.Start
            )

            Spacer(modifier = Modifier.weight(1f))

            Icon(
                imageVector = ImageVector.vectorResource(id = R.drawable.chevron_right),
                contentDescription = "Flecha derecha",
                modifier = Modifier.size(43.dp),
                tint = IconColor
            )
        }
    }
}



@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomCardGasto(
    fecha: String,
    nombreGasto: String,
    precioGasto: String,
    iconoNombre: String,
    onClick: () -> Unit // 👉 Nuevo parámetro
) {
    val context = LocalContext.current
    val iconResId = remember(iconoNombre) {
        context.resources.getIdentifier(iconoNombre, "drawable", context.packageName)
    }

    Column {
        Text(
            text = fecha,
            modifier = Modifier.padding(start = 8.dp),
            style = TextStyle(
                fontSize = 16.sp,
                fontFamily = OpenSauce,
                color = Color.Black
            )
        )
        Card(
            shape = RoundedCornerShape(19.dp),
            colors = CardDefaults.cardColors(containerColor = CardColor),
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onClick() } // 👈 Ejecuta la acción pasada
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Start
            ) {
                Icon(
                    painter = painterResource(id = iconResId),
                    contentDescription = "Ícono del gasto",
                    modifier = Modifier.size(43.dp),
                    tint = IconColor
                )

                Spacer(modifier = Modifier.width(25.dp))

                Text(
                    text = nombreGasto,
                    fontSize = 24.sp,
                    fontFamily = OpenSansSemiCondensed,
                    color = Color.Black
                )

                Spacer(modifier = Modifier.weight(1f))

                Text(
                    fontSize = 21.sp,
                    text = "$precioGasto €",
                    fontFamily = OpenSauce,
                    color = Color.Black
                )
            }
        }
    }
}




@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomCardSaldo(
    nombrePersona: String,
    gastoPersona: String,
) {
    Card(
        shape = RoundedCornerShape(19.dp),
        colors = CardDefaults.cardColors(containerColor = CardColor), // Color de fondo
        modifier = Modifier
            .fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Start // Alinea los elementos a la izquierda
        ) {
            // Texto del nombre de la persona
            Text(
                text = nombrePersona,
                fontSize = 22.sp,
                fontFamily = OpenSansSemiCondensed,
                color = Color.Black,
                textAlign = TextAlign.Start,

            )
            Spacer(modifier = Modifier.weight(1f)) // Empuja el icono de la derecha
            // texto del gasto de la persona
            Text(
                fontSize = 20.sp,
                text = "$gastoPersona €",
                fontFamily = OpenSauce,
                color = Color.Black,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomCardSaldoPersonal(
    gastoPersona: String,
) {
    val cantidad = gastoPersona.replace(",", ".").toDoubleOrNull() ?: 0.0

    val colorTexto = when {
        cantidad > 0 -> Green
        cantidad < 0 -> Color.Red
        else -> Color.Black
    }

    val textoEtiqueta = if (cantidad < 0) "Debes:" else "Te deben:"

    Card(
        shape = RoundedCornerShape(19.dp),
        colors = CardDefaults.cardColors(containerColor = CardColor),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 30.dp, vertical = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Start
        ) {
            Text(
                text = textoEtiqueta,
                fontSize = 30.sp,
                fontFamily = OpenSansSemiCondensed,
                color = Color.Black,
                textAlign = TextAlign.Start,
            )
            Spacer(modifier = Modifier.weight(1f))
            Text(
                fontSize = 25.sp,
                text = "$gastoPersona €",
                fontFamily = OpenSauce,
                color = colorTexto
            )
        }
    }
}





@Composable
fun CheckboxCard(
    persona: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Card(
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = CardColor),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 15.dp, end = 10.dp)
        ) {
            Text(
                fontSize = 15.sp,
                text = persona,
                fontFamily = OpenSansNormal,
                color = Color.Black,
            )
            Checkbox(
                checked = checked,
                onCheckedChange = onCheckedChange // Sincroniza con el estado global
            )
        }
    }
}


@Composable
fun SelectPersonCard(
    personas: Map<String, String>, // uid -> nombre
    onSelected: (String) -> Unit
) {
    val firstUid = personas.keys.firstOrNull()
    var selectedUid by remember { mutableStateOf(firstUid ?: "") }
    var expanded by remember { mutableStateOf(false) }

    val selectedName = personas[selectedUid] ?: "Seleccionar persona"

    Box {
        Card(
            shape = RoundedCornerShape(10.dp),
            colors = CardDefaults.cardColors(containerColor = CardColor),
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = true }
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = selectedName,
                    fontSize = 15.sp,
                    fontFamily = OpenSansNormal,
                    color = Color.Black
                )
                Icon(
                    painter = painterResource(id = android.R.drawable.arrow_down_float),
                    contentDescription = "Abrir selección",
                    tint = Color.Black
                )
            }
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            personas.forEach { (uid, nombre) ->
                DropdownMenuItem(
                    text = { Text(nombre) },
                    onClick = {
                        selectedUid = uid
                        expanded = false
                        onSelected(uid)
                    }
                )
            }
        }
    }
}



@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationCard(
    title: String,
    description: String,
    onDelete: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(19.dp),
        colors = CardDefaults.cardColors(containerColor = CardColor),
        modifier = Modifier
            .fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(25.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Start
        ) {
            // Título y descripción
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = title,
                    fontSize = 20.sp,
                    fontFamily = OpenSansSemiCondensed,
                    color = Color.Black
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = description,
                    fontSize = 15.sp,
                    fontFamily = OpenSansSemiCondensed,
                    color = Color.Black
                )
            }

            Spacer(modifier = Modifier.width(25.dp))
            // Icono de basura a la derecha
            IconButton(onClick = onDelete) {
                Icon(
                    painter = painterResource(id = R.drawable.delete),
                    contentDescription = "Eliminar",
                    modifier = Modifier.size(40.dp),
                    tint = IconColor
                )
            }
        }
    }
}

@Composable
fun NotificationCardWithAnimation(
    notification: Notification,
    onDeleteConfirmed: (String) -> Unit
) {
    var visible by remember { mutableStateOf(true) }

    // Esperar a que visible sea false para lanzar la eliminación
    LaunchedEffect(visible) {
        if (!visible) {
            delay(300) // esperar la animación
            onDeleteConfirmed(notification.id)
        }
    }

    AnimatedVisibility(
        visible = visible,
        exit = fadeOut(animationSpec = tween(300)) + slideOutVertically(animationSpec = tween(300)),
        modifier = Modifier.animateContentSize()
    ) {
        NotificationCard(
            title = notification.title,
            description = notification.description,
            onDelete = { visible = false }
        )
    }
}



