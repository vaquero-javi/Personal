package com.example.ptdapp.ui.screens.createPTDScreen

import androidx.lifecycle.ViewModel
import com.example.ptdapp.data.repositories.CreatePTDRepository

class CreatePTDViewModel : ViewModel() {

    private val repository = CreatePTDRepository()

    fun crearPTD(
        nombre: String,
        descripcion: String,
        iconoId: Int,
        onSuccess: () -> Unit,
        onFailure: (Exception) -> Unit
    ) {
        repository.crearPTD(
            nombre = nombre,
            descripcion = descripcion,
            iconoId = iconoId,
            onSuccess = onSuccess,
            onFailure = onFailure
        )
    }
}
