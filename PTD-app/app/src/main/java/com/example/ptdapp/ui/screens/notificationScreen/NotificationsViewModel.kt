package com.example.ptdapp.ui.screens.notificationScreen

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.ptdapp.data.repositories.NotificationsRepository
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import com.example.ptdapp.data.model.Notification



class NotificationsViewModel : ViewModel() {

    private val repository = NotificationsRepository()

    private val _notifications = MutableStateFlow<List<Notification>>(emptyList())
    val notifications: StateFlow<List<Notification>> = _notifications

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _hasUnread = MutableStateFlow(false)
    val hasUnread: StateFlow<Boolean> = _hasUnread

    init {
        viewModelScope.launch {
            repository.getNotificationsFlow().collect { notificationList: List<Notification> ->
                _notifications.value = notificationList
                _hasUnread.value = notificationList.any { !it.read }
                _isLoading.value = false
            }
        }
    }

    fun deleteNotification(id: String) {
        viewModelScope.launch {
            _isLoading.value = true
            repository.deleteNotification(id)
            _isLoading.value = false
        }
    }

    fun markAllAsRead() {
        val userId = FirebaseAuth.getInstance().currentUser?.uid ?: return
        val ref = FirebaseFirestore.getInstance()
            .collection("users").document(userId)
            .collection("notifications")

        viewModelScope.launch {
            // Solo marcamos las que están sin leer
            _notifications.value
                .filter { !it.read }
                .forEach { notification ->
                    ref.document(notification.id).update("read", true).await()
                }

            // Opcional: actualizamos el estado local
            _hasUnread.value = false
        }
    }
    fun notificarLiquidacionDeGrupo(grupoNombre: String, miembros: List<String>) {
        viewModelScope.launch {
            repository.notificarLiquidacionDeudas(grupoNombre, miembros)
        }
    }

}




