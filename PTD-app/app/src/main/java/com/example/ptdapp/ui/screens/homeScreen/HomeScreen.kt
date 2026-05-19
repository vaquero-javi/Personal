package com.example.ptdapp.ui.screens.homeScreen

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.example.ptdapp.ui.components.CustomCardInicio
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.painterResource
import com.example.ptdapp.R
import com.example.ptdapp.ui.components.LogoSpinner
import com.example.ptdapp.ui.navigation.Destinations
import com.example.ptdapp.ui.viewmodel.HomeViewModel


@Composable
fun HomeScreen(
    navController: NavHostController,
    viewModel: HomeViewModel = viewModel()
) {
    val grupos by viewModel.gruposUsuario
    val isLoading by viewModel.isLoading

    LaunchedEffect(Unit) {
        viewModel.cargarGruposDelUsuario()
    }

    if (isLoading) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            LogoSpinner()
        }
    } else {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 25.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 16.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.logo_transparente),
                        contentDescription = "Logo",
                        modifier = Modifier.height(50.dp)
                    )
                }
            }
            items(items = grupos, key = { it.id }) { grupo ->
                CustomCardInicio(
                    text = grupo.nombre,
                    iconoNombre = grupo.iconoNombre,
                    onClick = {
                        navController.navigate(Destinations.detailPTDRoute(grupo.id))
                    }
                )
            }
        }
    }
}



