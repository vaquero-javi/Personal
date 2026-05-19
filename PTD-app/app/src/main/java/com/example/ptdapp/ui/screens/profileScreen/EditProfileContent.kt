package com.example.ptdapp.ui.screens.profileScreen


import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.ptdapp.ui.components.LogoSpinner
import com.example.ptdapp.ui.components.ProfileTextFieldStyled
import com.example.ptdapp.ui.components.SelectorPaisCiudadStyled
import com.example.ptdapp.ui.theme.BlueLight
import kotlinx.coroutines.launch


@Composable
fun EditProfileContent(
    profileViewModel: ProfileViewModel = viewModel(),
    onClose: () -> Unit
) {
    val user = profileViewModel.user.collectAsState().value
    val mensajeGuardado by profileViewModel.mensajeGuardado.collectAsState()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val isLoading by profileViewModel.isLoading.collectAsState()

    var nombre by remember { mutableStateOf("") }
    var pais by remember { mutableStateOf("") }
    var ciudad by remember { mutableStateOf("") }

    // Efecto de carga inicial
    LaunchedEffect(user) {
        user?.let {
            nombre = it.nombre
            pais = it.pais
            ciudad = it.ciudad
        }
    }

    // Cierre automático y snackbar
    LaunchedEffect(mensajeGuardado) {
        if (mensajeGuardado) {
            scope.launch {
                snackbarHostState.showSnackbar("Perfil guardado correctamente")
                profileViewModel.resetMensajeGuardado()
                onClose()
            }
        }
    }

    // Scroll para evitar contenido recortado
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 16.dp)
            .navigationBarsPadding() // ⬅️ importante para evitar corte por los gestos
            .imePadding() // ⬅️ para evitar solapamiento con el teclado
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Editar perfil",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(16.dp))

        ProfileTextFieldStyled(
            label = "Nombre",
            placeholder = "Tu nombre",
            value = nombre,
            onValueChange = { nombre = it },
            readOnly = false
        )

        Spacer(modifier = Modifier.height(16.dp))

        SelectorPaisCiudadStyled(
            paisSeleccionado = pais,
            ciudadSeleccionada = ciudad,
            onPaisSeleccionado = { pais = it },
            onCiudadSeleccionada = { ciudad = it }
        )

        Spacer(modifier = Modifier.height(32.dp))

        Button(onClick = {
            profileViewModel.actualizarPerfil(nombre, pais, ciudad)
        },
            colors = ButtonDefaults.buttonColors(containerColor = BlueLight),
            shape = RoundedCornerShape(10.dp), // Bordes redondeados
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp) // Altura del botón
        ) {
            Text("Guardar cambios")
        }

        Spacer(modifier = Modifier.height(16.dp))

        SnackbarHost(hostState = snackbarHostState)

        if (isLoading) {
            LogoSpinner()
        }
    }
}


