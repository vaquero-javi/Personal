package com.example.ptdapp.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ptdapp.ui.theme.*
import androidx.compose.foundation.clickable
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import com.example.ptdapp.R
import androidx.compose.foundation.Image
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType


@Composable
fun CustomTextField(
    label: String? = null,
    placeholder: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier? = null
) {
    Column(modifier = modifier ?: Modifier) {
        label?.let {
            Text(
                text = it,
                style = TextStyle(
                    fontSize = 26.sp,
                    fontFamily = Dongle,
                    color = Color.Black
                )
            )
        }

        TextField(
            value = value,
            onValueChange = { newValue ->
                onValueChange(newValue.replace("\n", "")) // Bloquea ENTER
            },
            colors = textFieldColors(),
            placeholder = {
                Text(
                    text = placeholder,
                    style = TextStyle(
                        fontFamily = OpenSansNormal,
                        fontSize = 18.sp,
                        color = Gray
                    )
                )
            },
            textStyle = TextStyle(
                fontFamily = OpenSansNormal,
                fontSize = 18.sp,
                color = Color.Black
            ),
            shape = RoundedCornerShape(10.dp),
            singleLine = true, // Evita múltiples líneas y ENTER
            modifier = Modifier.fillMaxWidth()
        )
    }
}


@Composable
fun NumericTextField(
    label: String? = null,
    placeholder: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier? = null
) {
    Column(modifier = modifier ?: Modifier) {
        label?.let {
            Text(
                text = it,
                style = TextStyle(
                    fontSize = 26.sp,
                    fontFamily = Dongle,
                    color = Color.Black
                )
            )
        }

        TextField(
            value = value,
            onValueChange = { newValue ->
                // Acepta solo números y un punto decimal opcional
                if (newValue.matches(Regex("^\\d{0,9}(\\.\\d{0,2})?$"))) {
                    onValueChange(newValue)
                }
            },
            keyboardOptions = KeyboardOptions.Default.copy(
                keyboardType = KeyboardType.Number
            ),
            colors = textFieldColors(),
            placeholder = {
                Text(
                    text = placeholder,
                    style = TextStyle(
                        fontFamily = OpenSansNormal,
                        fontSize = 18.sp,
                        color = Gray
                    )
                )
            },
            textStyle = TextStyle(
                fontFamily = OpenSansNormal,
                fontSize = 18.sp,
                color = Color.Black
            ),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        )
    }
}



@Composable
fun CustomBigTextField(
    label: String,
    placeholder: String,
    onTextChanged: (String) -> Unit // 👈 Nuevo parámetro
) {
    var textState by remember { mutableStateOf(TextFieldValue("")) }

    Column {
        Text(
            text = label,
            style = TextStyle(
                fontSize = 25.sp,
                fontFamily = Dongle,
                color = Color.Black
            ),
        )
        TextField(
            value = textState,
            onValueChange = {
                textState = it
                onTextChanged(it.text) // 👈 Callback para notificar cambios
            },
            colors = textFieldColors(),
            placeholder = {
                Text(
                    text = placeholder,
                    style = TextStyle(
                        fontFamily = OpenSansNormal,
                        fontSize = 15.sp,
                        color = Gray
                    )
                )
            },
            textStyle = TextStyle(
                fontFamily = OpenSansNormal,
                fontSize = 15.sp,
                color = Color.Black
            ),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(150.dp)
        )
    }
}



@Composable
fun CustomTextFieldPassword(
    label: String,
    placeholder: String,
    value: String,
    onValueChange: (String) -> Unit
) {
    var passwordVisible by remember { mutableStateOf(false) }

    Column {
        Text(
            text = label,
            style = TextStyle(
                fontSize = 26.sp,
                fontFamily = Dongle,
                color = Color.Black
            ),
        )
        TextField(
            value = value,
            onValueChange = { newValue ->
                onValueChange(newValue.replace("\n", "")) // Bloquear ENTER
            },
            colors = textFieldColors(),
            placeholder = {
                Text(
                    text = placeholder,
                    style = TextStyle(
                        fontFamily = OpenSansNormal,
                        fontSize = 18.sp,
                        color = Gray
                    )
                )
            },
            textStyle = TextStyle(
                fontFamily = OpenSansNormal,
                fontSize = 18.sp,
                color = Color.Black
            ),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true, // Evita múltiples líneas
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                Icon(
                    painter = painterResource(
                        id = if (passwordVisible) R.drawable.visibility else R.drawable.visibility_off
                    ),
                    contentDescription = if (passwordVisible) "Ocultar contraseña" else "Mostrar contraseña",
                    tint = Gray,
                    modifier = Modifier
                        .size(24.dp)
                        .clickable { passwordVisible = !passwordVisible }
                )
            }
        )
    }
}



@Composable
fun CustomTextFieldIcon(
    label: String,
    placeholder: String,
    selectedIcon: Int,
    onIconSelected: (Int) -> Unit,
    onTextChanged: (String) -> Unit
) {
    var textState by remember { mutableStateOf(TextFieldValue("")) }
    var expanded by remember { mutableStateOf(false) }

    val iconOptions = listOf(
        R.drawable.image, R.drawable.restaurant, R.drawable.credit_card
    )

    Column {
        Text(
            text = label,
            style = TextStyle(
                fontSize = 25.sp,
                fontFamily = Dongle,
                color = Color.Black
            ),
        )
        TextField(
            value = textState,
            onValueChange = {
                textState = it
                onTextChanged(it.text)
            },
            colors = textFieldColors(),
            placeholder = {
                Text(
                    text = placeholder,
                    style = TextStyle(
                        fontSize = 15.sp,
                        fontFamily = OpenSansNormal,
                        color = Gray
                    )
                )
            },
            textStyle = TextStyle(
                fontSize = 15.sp,
                fontFamily = OpenSansNormal,
                color = Color.Black
            ),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth(),
            trailingIcon = {
                Box {
                    Image(
                        painter = painterResource(id = selectedIcon),
                        contentDescription = "Seleccionar icono",
                        modifier = Modifier
                            .size(28.dp)
                            .clickable { expanded = true }
                    )

                    DropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false }
                    ) {
                        iconOptions.forEach { icon ->
                            DropdownMenuItem(
                                text = { Text("") },
                                onClick = {
                                    onIconSelected(icon)
                                    expanded = false
                                },
                                leadingIcon = {
                                    Image(
                                        painter = painterResource(id = icon),
                                        contentDescription = "Icono",
                                        modifier = Modifier.size(28.dp),
                                    )
                                }
                            )
                        }
                    }
                }
            },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.None),
            keyboardActions = KeyboardActions(onAny = {}),
            singleLine = true
        )
    }
}




@Composable
fun CustomTextFieldFixedIcon(
    label: String,
    placeholder: String,
    onTextChanged: (String) -> Unit
) {
    var textState by remember { mutableStateOf(TextFieldValue("")) }

    Column {
        Text(
            text = label,
            style = TextStyle(
                fontSize = 25.sp,
                fontFamily = Dongle,
                color = Color.Black
            )
        )

        TextField(
            value = textState,
            onValueChange = {
                textState = it
                onTextChanged(it.text)
            },
            colors = textFieldColors(),
            placeholder = {
                Text(
                    text = placeholder,
                    style = TextStyle(
                        fontSize = 15.sp,
                        fontFamily = OpenSansNormal,
                        color = Gray
                    )
                )
            },
            textStyle = TextStyle(
                fontSize = 15.sp,
                fontFamily = OpenSansNormal,
                color = Color.Black
            ),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth(),
            trailingIcon = {
                Icon(
                    painter = painterResource(id = R.drawable.euro_symbol),
                    contentDescription = "euro",
                    modifier = Modifier.size(28.dp),
                    tint = Color.Black
                )
            },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.None
            ),
            keyboardActions = KeyboardActions(onAny = {}),
            singleLine = true
        )
    }
}



@Composable
fun ProfileTextFieldStyled(
    label: String,
    placeholder: String,
    value: String,
    onValueChange: ((String) -> Unit)? = null, // Ahora es opcional
    trailingIcon: @Composable (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    readOnly: Boolean = true
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = TextStyle(
                fontSize = 25.sp,
                fontFamily = Dongle,
                color = Color.Black
            )
        )
        TextField(
            value = value,
            onValueChange = onValueChange ?: {}, // Si no se pasa, no hace nada
            readOnly = readOnly,
            enabled = !readOnly, // Solo editable si no está en modo lectura
            placeholder = {
                Text(
                    text = placeholder,
                    style = TextStyle(
                        fontSize = 15.sp,
                        fontFamily = OpenSansNormal,
                        color = Gray
                    )
                )
            },
            textStyle = TextStyle(
                fontSize = 15.sp,
                fontFamily = OpenSansNormal,
                color = Color.Black
            ),
            trailingIcon = trailingIcon,
            shape = RoundedCornerShape(10.dp),
            colors = textFieldColors(),
            modifier = Modifier.fillMaxWidth()
        )
    }
}


@Composable
private fun textFieldColors() = TextFieldDefaults.colors(
    unfocusedContainerColor = LightBlue,
    focusedContainerColor = LightBlueDark,
    cursorColor = Gray,
    focusedTextColor = Gray,
    unfocusedTextColor = Gray,
    focusedIndicatorColor = Color.Transparent,
    unfocusedIndicatorColor = Color.Transparent,
    disabledIndicatorColor = Color.Transparent,

    disabledContainerColor = LightBlue,
    disabledTextColor = Color.Black
)




