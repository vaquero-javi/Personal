package com.example.ptdapp.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.TextStyle
import com.example.ptdapp.ui.theme.BlueLight
import com.example.ptdapp.ui.theme.OpenSansSemiCondensed


@Composable
fun LoginButtonComponent(onLoginClick: () -> Unit) {
    Button(
        onClick = {
            onLoginClick()
        },
        colors = ButtonDefaults.buttonColors(containerColor = BlueLight),
        shape = RoundedCornerShape(10.dp), // Bordes redondeados
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp) // Altura del botón
    ) {
        Text(
            text = "Iniciar Sesión",
            style = TextStyle(
                fontFamily = OpenSansSemiCondensed,
                fontSize = 19.sp,
                color = Color.Black
            )
        )
    }
}

@Composable
fun RegisterButtonComponent(onRegisterClick: () -> Unit) {
    Button(
        onClick = {
            onRegisterClick()
        },
        colors = ButtonDefaults.buttonColors(containerColor = BlueLight),
        shape = RoundedCornerShape(10.dp), // Bordes redondeados
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp) // Altura del botón
    ) {
        Text(
            text = "Registrarse",
            fontSize = 19.sp,
            style = TextStyle(
                fontFamily = OpenSansSemiCondensed,
                fontSize = 18.sp,
                color = Color.Black
            )
        )
    }
}

@Composable
fun CreatePTDButtonComponent(
    buttonText: String,
    onCreateClick: () -> Unit
) {
    Button(
        onClick = onCreateClick,
        colors = ButtonDefaults.buttonColors(containerColor = BlueLight),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
    ) {
        Text(
            text = buttonText,
            fontSize = 19.sp,
            style = TextStyle(
                fontFamily = OpenSansSemiCondensed,
                fontSize = 18.sp,
                color = Color.Black
            )
        )
    }
}


@Composable
fun CreateGastoButtonComponent(
    buttonText: String,
    enabled: Boolean = true,
    onCreateClick: () -> Unit
) {
    Button(
        onClick = onCreateClick,
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = if (enabled) BlueLight else Color.Gray
        ),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
    ) {
        Text(
            text = buttonText,
            fontSize = 19.sp,
            style = TextStyle(
                fontFamily = OpenSansSemiCondensed,
                fontSize = 18.sp,
                color = Color.Black
            )
        )
    }
}


@Composable
fun IngresarButtonComponent(onIngresarClick: () -> Unit) {
    Button(
        onClick = onIngresarClick,
        colors = ButtonDefaults.buttonColors(containerColor = BlueLight),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier
            .fillMaxWidth(0.5f)
            .height(50.dp)
    ) {
        Text(
            text = "Ingresar",
            style = TextStyle(
                fontFamily = OpenSansSemiCondensed,
                fontSize = 18.sp,
                color = Color.Black
            )
        )
    }
}




