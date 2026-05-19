package com.example.ptdapp.ui.screens.detailPTDScreen.gastos

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.ptdapp.data.model.Gasto
import com.example.ptdapp.data.repositories.GastoRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class GastosViewModel : ViewModel() {

    private val repository = GastoRepository()

    private val _gastos = MutableStateFlow<List<Gasto>>(emptyList())
    val gastos: StateFlow<List<Gasto>> = _gastos


    fun cargarGastos(grupoId: String) {
        viewModelScope.launch {
            repository.getGastosFlow(grupoId).collectLatest { lista ->
                _gastos.value = lista
            }
        }
    }
}