package com.example.ptdapp.ui.screens.createGastoScreen

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ptdapp.R
import com.example.ptdapp.ui.components.CheckboxCard
import com.example.ptdapp.ui.components.CustomTextFieldFixedIcon
import com.example.ptdapp.ui.components.CustomTextFieldIcon
import com.example.ptdapp.ui.theme.BlueLight
import com.example.ptdapp.ui.theme.Dongle
import com.example.ptdapp.ui.theme.OpenSansNormal
import com.example.ptdapp.ui.theme.OpenSansSemiCondensed
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.ptdapp.data.model.PTDGroup
import com.example.ptdapp.ui.components.CreateGastoButtonComponent
import com.example.ptdapp.ui.components.SelectPersonCard
import com.example.ptdapp.data.repositories.UserRepository
import com.example.ptdapp.ui.components.CustomBigTextField
import com.google.firebase.Firebase
import com.google.firebase.firestore.firestore

@Composable
fun CreateGastoScreen(
    navController: NavHostController,
    grupoId: String
) {
    val db = Firebase.firestore
    val context = LocalContext.current
    var selectedIcon by remember { mutableStateOf(R.drawable.image) }
    val viewModel: GastoViewModel = viewModel()


    var titulo by remember { mutableStateOf("") }
    var precio by remember { mutableStateOf("") }

    var miembros by remember { mutableStateOf<List<String>>(emptyList()) }
    var nombreUsuarios by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var checkedStates by remember { mutableStateOf<Map<String, Boolean>>(emptyMap()) }
    var pagadoPor by remember { mutableStateOf<String?>(null) }
    var descripcion by remember { mutableStateOf("") }


    LaunchedEffect(grupoId) {
        db.collection("grupos").document(grupoId).get()
            .addOnSuccessListener { doc ->
                val grupo = doc.toObject(PTDGroup::class.java)
                grupo?.let {
                    miembros = it.miembros
                    checkedStates = it.miembros.associateWith { true }
                    pagadoPor = null

                    UserRepository.getUserNamesByUids(it.miembros) { nombres ->
                        nombreUsuarios = nombres
                    }
                }
            }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 40.dp, vertical = 20.dp)
                .align(Alignment.TopCenter),
            horizontalAlignment = Alignment.Start
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable { navController.popBackStack() }
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.arrow_back_ios),
                    contentDescription = "Cancelar",
                    modifier = Modifier.size(24.dp),
                    tint = BlueLight
                )
                Text(
                    text = "Cancelar",
                    color = BlueLight,
                    fontSize = 20.sp,
                    fontFamily = OpenSansNormal,
                    modifier = Modifier.padding(start = 4.dp)
                )
            }

            Spacer(modifier = Modifier.height(40.dp))

            Text(
                text = "Añadir Gasto",
                fontSize = 28.sp,
                fontFamily = OpenSansSemiCondensed,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )

            Spacer(modifier = Modifier.height(30.dp))

            CustomTextFieldIcon(
                label = "Título",
                placeholder = "Añadir título aquí",
                selectedIcon,
                onIconSelected = { selectedIcon = it },
                onTextChanged = { titulo = it }
            )
            val iconoNombre = when (selectedIcon) {
                R.drawable.image -> "image"
                R.drawable.restaurant -> "restaurant"
                R.drawable.credit_card -> "credit_card"
                else -> "image"
            }

            CustomBigTextField(
                label = "Descripción",
                placeholder = "Añadir descripción aquí",
                onTextChanged = {
                    descripcion = it
                }
            )


            Spacer(modifier = Modifier.height(16.dp))

            CustomTextFieldFixedIcon(
                label = "Precio",
                placeholder = "0,00",
                onTextChanged = { precio = it }
            )

            Spacer(modifier = Modifier.height(25.dp))

            Text(
                text = "A dividir entre",
                fontSize = 25.sp,
                fontFamily = Dongle,
                color = Color.Black
            )

            Spacer(modifier = Modifier.height(8.dp))

            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 100.dp, max = 300.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(miembros) { uid ->
                    val nombreVisible = nombreUsuarios[uid] ?: uid
                    CheckboxCard(
                        persona = nombreVisible,
                        checked = checkedStates[uid] ?: true,
                        onCheckedChange = { isChecked ->
                            checkedStates = checkedStates.toMutableMap().apply {
                                put(uid, isChecked)
                            }
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(35.dp))

            Text(
                text = "Pagado por",
                fontSize = 25.sp,
                fontFamily = Dongle,
                color = Color.Black
            )

            SelectPersonCard(
                personas = nombreUsuarios,
                onSelected = { pagadoPor = it }
            )

            Spacer(modifier = Modifier.height(70.dp))

            val participantes = checkedStates.filterValues { it }.keys.toList()
            val cantidadDouble = precio.replace(",", ".").toDoubleOrNull()
            val isFormValid = titulo.isNotBlank() &&
                    cantidadDouble != null && cantidadDouble > 0.0 &&
                    participantes.isNotEmpty() &&
                    !pagadoPor.isNullOrBlank()


            CreateGastoButtonComponent(
                buttonText = "Crear gasto",
                enabled = isFormValid
            ) {
                // Guardar gasto (ya validado por isFormValid)
                viewModel.guardarGasto(
                    grupoId,
                    titulo,
                    cantidad = cantidadDouble ?: 0.0,
                    pagadoPor!!,
                    divididoEntre = participantes,
                    iconoNombre,
                    descripcion,
                    onSuccess = {
                        Toast.makeText(context, "Gasto creado", Toast.LENGTH_SHORT).show()
                        navController.popBackStack()
                    },
                    onFailure = {
                        Toast.makeText(context, "Error al guardar", Toast.LENGTH_SHORT).show()
                    }
                )
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}