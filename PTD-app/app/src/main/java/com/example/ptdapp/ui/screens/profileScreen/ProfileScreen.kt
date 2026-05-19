package com.example.ptdapp.ui.screens.profileScreen

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.example.ptdapp.R
import com.example.ptdapp.ui.authViewmodel.AuthViewModel
import com.example.ptdapp.ui.components.LogoSpinner
import com.example.ptdapp.ui.components.ProfileTextFieldStyled
import com.example.ptdapp.ui.navigation.Destinations
import com.example.ptdapp.ui.theme.BlueLight
import com.example.ptdapp.ui.theme.OpenSansNormal
import com.example.ptdapp.ui.theme.OpenSansSemiCondensed


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    navController: NavHostController,
    authViewModel: AuthViewModel,
    profileViewModel: ProfileViewModel = viewModel()
) {
    val firebaseUser = authViewModel.user.collectAsState().value
    val firestoreUser = profileViewModel.user.collectAsState().value
    val isLoading by profileViewModel.isLoading.collectAsState()
    val showBottomSheet = remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .imePadding() // 👈 evita que el teclado tape el contenido
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()) // 👈 scroll si es necesario
                .padding(40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Top
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Start,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = { navController.popBackStack() })
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.arrow_back_ios),
                    contentDescription = "Atras",
                    modifier = Modifier.size(24.dp),
                    tint = BlueLight
                )
            }


            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Perfil",
                fontSize = 31.sp,
                fontFamily = OpenSansSemiCondensed,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(16.dp))

            Icon(
                painter = painterResource(id = R.drawable.account_circle),
                contentDescription = "Usuario",
                tint = BlueLight,
                modifier = Modifier.size(120.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))

            ProfileTextFieldStyled(
                label = "Correo electrónico",
                placeholder = "correo@gmail.com",
                value = firebaseUser?.email ?: ""
            )

            Spacer(modifier = Modifier.height(55.dp))

            ProfileTextFieldStyled(
                label = "Nombre",
                placeholder = "nombre",
                value = firestoreUser?.nombre ?: ""
            )

            Spacer(modifier = Modifier.height(12.dp))

            ProfileTextFieldStyled(
                label = "País",
                placeholder = "país",
                value = firestoreUser?.pais ?: ""
            )

            Spacer(modifier = Modifier.height(12.dp))

            ProfileTextFieldStyled(
                label = "Ciudad",
                placeholder = "ciudad",
                value = firestoreUser?.ciudad ?: ""
            )

            Spacer(modifier = Modifier.height(40.dp))

            Button(
                onClick = { showBottomSheet.value = true },
                colors = ButtonDefaults.buttonColors(containerColor = BlueLight),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
            ) {
                Text("Editar perfil")
            }

            Spacer(modifier = Modifier.height(30.dp))

            TextButton(onClick = { authViewModel.logout() }) {
                Text(
                    text = "Cerrar Sesión",
                    fontFamily = OpenSansNormal,
                    fontSize = 18.sp,
                    color = Color.Red
                )
            }

            Spacer(modifier = Modifier.height(32.dp)) // 👈 espacio final extra
        }

        if (showBottomSheet.value) {
            ModalBottomSheet(
                onDismissRequest = {
                    showBottomSheet.value = false
                    profileViewModel.cargarDatosUsuario()
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                EditProfileContent(
                    onClose = {
                        showBottomSheet.value = false
                        profileViewModel.cargarDatosUsuario()
                    }
                )
            }
        }

        if (isLoading) {
            LogoSpinner()
        }
    }
}



