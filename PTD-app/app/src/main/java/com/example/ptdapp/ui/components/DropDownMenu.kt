package com.example.ptdapp.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ptdapp.ui.theme.Dongle
import com.example.ptdapp.ui.theme.Gray
import com.example.ptdapp.ui.theme.LightBlue
import com.example.ptdapp.ui.theme.LightBlueDark
import com.example.ptdapp.ui.theme.OpenSansNormal
import com.example.ptdapp.ui.utils.leerPaisesDesdeJson


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DropdownSelectorStyled(
    etiqueta: String,
    opciones: List<String>,
    seleccion: String?,
    onSeleccion: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = etiqueta,
            style = TextStyle(
                fontSize = 25.sp,
                fontFamily = Dongle,
                color = Color.Black
            )
        )

        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded }
        ) {
            OutlinedTextField(
                value = seleccion ?: "",
                onValueChange = {},
                readOnly = true,
                singleLine = true,
                trailingIcon = {
                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
                },
                shape = RoundedCornerShape(10.dp),
                textStyle = TextStyle(
                    fontSize = 15.sp,
                    fontFamily = OpenSansNormal,
                    color = Color.Black
                ),
                placeholder = {
                    Text(
                        text = etiqueta,
                        style = TextStyle(
                            fontSize = 15.sp,
                            fontFamily = OpenSansNormal,
                            color = Gray
                        )
                    )
                },
                colors = TextFieldDefaults.colors(
                    unfocusedContainerColor = LightBlue,
                    focusedContainerColor = LightBlueDark,
                    cursorColor = Gray,
                    focusedTextColor = Gray,
                    unfocusedTextColor = Gray,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    disabledIndicatorColor = Color.Transparent,

                    // 🔥 Añade estas dos líneas:
                    disabledContainerColor = LightBlue,
                    disabledTextColor = Color.Black
                ),
                modifier = Modifier
                    .menuAnchor()
                    .fillMaxWidth()
            )

            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                opciones.forEach { opcion ->
                    DropdownMenuItem(
                        text = {
                            Text(
                                text = opcion,
                                fontFamily = OpenSansNormal
                            )
                        },
                        onClick = {
                            onSeleccion(opcion)
                            expanded = false
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun SelectorPaisCiudadStyled(
    paisSeleccionado: String?,
    ciudadSeleccionada: String?,
    onPaisSeleccionado: (String) -> Unit,
    onCiudadSeleccionada: (String) -> Unit
) {
    val context = LocalContext.current
    val paisesConCiudades = remember { leerPaisesDesdeJson(context) }

    val listaPaises = paisesConCiudades.map { it.pais }
    val listaCiudades = paisesConCiudades.find { it.pais == paisSeleccionado }?.ciudades ?: emptyList()

    Column {
        DropdownSelectorStyled(
            etiqueta = "País",
            opciones = listaPaises,
            seleccion = paisSeleccionado,
            onSeleccion = {
                onPaisSeleccionado(it)
                onCiudadSeleccionada("") // Reinicia ciudad al cambiar país
            }
        )

        DropdownSelectorStyled(
            etiqueta = "Ciudad",
            opciones = listaCiudades,
            seleccion = ciudadSeleccionada,
            onSeleccion = { onCiudadSeleccionada(it) }
        )
    }
}

