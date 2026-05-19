package com.example.ptdapp.ui.screens.registerScreen


import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.example.ptdapp.R
import com.example.ptdapp.ui.components.CustomTextField
import com.example.ptdapp.ui.components.CustomTextFieldPassword
import com.example.ptdapp.ui.components.RegisterButtonComponent
import com.example.ptdapp.ui.navigation.Destinations
import com.example.ptdapp.ui.authViewmodel.AuthViewModel
import com.example.ptdapp.ui.components.LogoSpinner
import com.example.ptdapp.ui.theme.BlueLight
import com.example.ptdapp.ui.theme.Dongle

@Composable
fun RegisterScreen(navController: NavHostController, viewModel: AuthViewModel = viewModel()) {
    val context = LocalContext.current

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    val isLoading by viewModel.isLoading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()
    val user by viewModel.user.collectAsState()

    LaunchedEffect(user) {
        if (user != null) {
            Toast.makeText(context, "Registro exitoso", Toast.LENGTH_SHORT).show()
            navController.navigate(Destinations.MAIN_SCREEN)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .imePadding() // 👈 Para que el teclado no tape campos
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()) // 👈 Scroll habilitado
                .padding(horizontal = 40.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Top
        ) {
            LoginLabel {
                navController.navigate(Destinations.LOGIN_SCREEN)
            }

            Spacer(modifier = Modifier.height(16.dp))

            Image(
                painter = painterResource(id = R.drawable.logo_transparente),
                contentDescription = "Logo de la aplicación",
                modifier = Modifier
                    .width(300.dp)
                    .height(160.dp),
            )

            Spacer(modifier = Modifier.height(32.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .background(BlueLight)
            )

            Spacer(modifier = Modifier.height(32.dp)) // ⬅️ Ajustado

            CustomTextField(
                label = "Correo electrónico",
                placeholder = "correo@gmail.com",
                value = email,
                onValueChange = { email = it }
            )

            Spacer(modifier = Modifier.height(10.dp))

            CustomTextFieldPassword(
                label = "Contraseña",
                placeholder = "********",
                value = password,
                onValueChange = { password = it }
            )

            Spacer(modifier = Modifier.height(10.dp))

            CustomTextFieldPassword(
                label = "Confirmar contraseña",
                placeholder = "********",
                value = confirmPassword,
                onValueChange = { confirmPassword = it }
            )

            Spacer(modifier = Modifier.height(20.dp))

            /**
             *
            errorMessage?.let {
                Text(
                    text = it,
                    style = TextStyle(
                        fontSize = 20.sp,
                        fontFamily = Dongle,
                        color = MaterialTheme.colorScheme.error
                    )
                )
            }
             */

            Spacer(modifier = Modifier.height(32.dp)) // ⬅️ Ajustado

            RegisterButtonComponent(
                onRegisterClick = {
                    if (email.isNotEmpty() && password.isNotEmpty() && confirmPassword.isNotEmpty()) {
                        if (password == confirmPassword) {
                            viewModel.register(email, password)
                        } else {
                            Toast.makeText(
                                context,
                                "Las contraseñas no coinciden",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    } else {
                        Toast.makeText(
                            context,
                            "Completa todos los campos",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            )

            Spacer(modifier = Modifier.height(16.dp)) // Espacio final
        }

        if (isLoading) {
            LogoSpinner()
        }
    }
}




@Composable
fun LoginLabel(onLoginClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End // Alinea el texto a la derecha
    ) {
        Text(
            text = "Iniciar Sesión",
            style = TextStyle(
                fontFamily = Dongle,
                fontSize = 30.sp,
                color = BlueLight
            ),
            modifier = Modifier.clickable { onLoginClick() }
        )
    }
}





