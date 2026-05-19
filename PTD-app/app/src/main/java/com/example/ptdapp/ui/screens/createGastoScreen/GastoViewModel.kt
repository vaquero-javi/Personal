package com.example.ptdapp.ui.screens.createGastoScreen

import androidx.lifecycle.ViewModel
import com.example.ptdapp.data.model.Gasto
import com.example.ptdapp.data.repositories.GastoRepository

class GastoViewModel(
    private val repository: GastoRepository = GastoRepository()
) : ViewModel() {

    fun guardarGasto(
        grupoId: String,
        titulo: String,
        cantidad: Double,
        pagadoPor: String,
        divididoEntre: List<String>,
        iconoNombre: String,
        descripcion: String = "", // opcional
        onSuccess: () -> Unit,
        onFailure: (Exception) -> Unit
    ) {
        val gasto = Gasto(
            titulo = titulo,
            cantidad = cantidad,
            pagadoPor = pagadoPor,
            divididoEntre = divididoEntre,
            iconoNombre = iconoNombre,
            descripcion = descripcion
        )

        repository.crearGasto(grupoId, gasto, onSuccess, onFailure)
    }
}
