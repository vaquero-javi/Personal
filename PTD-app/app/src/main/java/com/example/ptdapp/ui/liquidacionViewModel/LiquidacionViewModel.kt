package com.example.ptdapp.ui.liquidacionViewModel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.ptdapp.data.model.PTDGroup
import com.example.ptdapp.data.repositories.LiquidacionRepository
import com.example.ptdapp.data.repositories.NotificationsRepository
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

sealed class LiquidacionEstado {
    object Idle : LiquidacionEstado()
    object Loading : LiquidacionEstado()
    object Success : LiquidacionEstado()
    data class Error(val mensaje: String) : LiquidacionEstado()
}

class LiquidacionViewModel(
    private val repository: LiquidacionRepository = LiquidacionRepository(),
    private val notificationsRepository: NotificationsRepository = NotificationsRepository(),
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()
) : ViewModel() {

    private val db = FirebaseFirestore.getInstance()

    private val _estadoLiquidacion = MutableStateFlow<LiquidacionEstado>(LiquidacionEstado.Idle)
    val estadoLiquidacion: StateFlow<LiquidacionEstado> = _estadoLiquidacion

    /** Saldar el grupo y avisar a todos sus miembros */
    fun liquidarGrupo(grupoId: String) = viewModelScope.launch {
        _estadoLiquidacion.value = LiquidacionEstado.Loading

        // 1. Tomamos nombre y miembros **antes** de liquidar
        val snapshot = db.collection("grupos").document(grupoId).get().await()
        val grupoPrevio = snapshot.toObject(PTDGroup::class.java)
        val miembrosPrevios = grupoPrevio?.miembros ?: emptyList()
        val nombreGrupo   = grupoPrevio?.nombre ?: "Grupo"

        // 2. Ejecutamos la liquidación
        val resultado = repository.liquidarGrupo(grupoId)

        _estadoLiquidacion.value = resultado.fold(
            onSuccess = {
                // 3. Enviamos la notificación genérica
                if (miembrosPrevios.isNotEmpty()) {
                    notificationsRepository.notificarLiquidacionDeudas(
                        grupoNombre = nombreGrupo,
                        miembros = miembrosPrevios
                    )
                }
                LiquidacionEstado.Success
            },
            onFailure = { e ->
                LiquidacionEstado.Error(e.message ?: "Error desconocido")
            }
        )
    }


    fun resetEstado() {
        _estadoLiquidacion.value = LiquidacionEstado.Idle
    }
}
