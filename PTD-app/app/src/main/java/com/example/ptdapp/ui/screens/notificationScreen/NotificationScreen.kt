package com.example.ptdapp.ui.screens.notificationScreen

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.example.ptdapp.ui.components.LogoSpinner
import com.example.ptdapp.ui.components.NotificationCard
import com.example.ptdapp.ui.components.NotificationCardWithAnimation

@Composable
fun NotificationScreen(
    navController: NavHostController,
    viewModel: NotificationsViewModel = viewModel()
) {
    val notifications by viewModel.notifications.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    // ✅ Marca todas como leídas al entrar en la pantalla
    LaunchedEffect(Unit) {
        viewModel.markAllAsRead()
    }

    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(25.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(notifications, key = { it.id }) { notification ->
                NotificationCardWithAnimation(
                    notification = notification,
                    onDeleteConfirmed = { viewModel.deleteNotification(it) }
                )
            }
        }
    }
}




