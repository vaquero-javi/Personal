package com.example.ptdapp.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.ptdapp.ui.theme.OpenSansSemiCondensed

val ColorBotones = Color(0xFF38B6FF)
val ColorCard = Color(0xFFefefef)

@Composable
fun CustomAlertDialog(
    message: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    confirmText: String = "Aceptar",
    dismissText: String = "Cancelar",
) {
    Dialog(onDismissRequest = { onDismiss() }) {
        Card(
            shape = RoundedCornerShape(19.dp),
            modifier = Modifier.padding(16.dp),
            colors = CardDefaults.cardColors(containerColor = ColorCard)
        ) {
            Column(
                modifier = Modifier
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Alerta !",
                    fontFamily = OpenSansSemiCondensed,
                    fontSize = 25.sp,
                    color = Color.Red,
                    textAlign = TextAlign.Start
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = message,
                    fontFamily = OpenSansSemiCondensed,
                    fontSize = 19.sp,
                    color = Color.Black,
                    textAlign = TextAlign.Justify
                )
                Spacer(modifier = Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    TextButton(onClick = { onDismiss() }) {
                        Text(
                            text = dismissText,
                            fontFamily = OpenSansSemiCondensed,
                            fontSize = 20.sp,
                            color = ColorBotones
                        )
                    }
                    TextButton(onClick = { onConfirm() }) {
                        Text(
                            text = confirmText,
                            fontFamily = OpenSansSemiCondensed,
                            fontSize = 20.sp,
                            color = ColorBotones
                        )
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
fun PreviewCustomAlertDialog() {
    var showDialog by remember { mutableStateOf(true) }

    if (showDialog) {
        CustomAlertDialog(
            message = "Si saldas las deudas de este grupo ya no se podrán editar posteriormente y el Grupo 1 se archivara.",
            onDismiss = { showDialog = false },
            onConfirm = { showDialog = false }
        )
    }
}
