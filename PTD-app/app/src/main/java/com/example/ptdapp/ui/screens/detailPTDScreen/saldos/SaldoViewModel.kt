package com.example.ptdapp.ui.screens.detailPTDScreen.saldos


import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import com.example.ptdapp.data.model.Gasto
import com.example.ptdapp.data.repositories.SaldoRepository
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Job


class SaldoViewModel(
    private val repository: SaldoRepository = SaldoRepository(),
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()
) : ViewModel() {

    /* --------------------------------------------------------- */
    /*  Parte antigua (nombres, saldos por grupo puntual)        */
    /* --------------------------------------------------------- */
    private val _saldos = MutableStateFlow<Map<String, Double>>(emptyMap())
    val saldos: StateFlow<Map<String, Double>> = _saldos

    private val _nombreUsuarios = MutableStateFlow<Map<String, String>>(emptyMap())
    val nombreUsuarios: StateFlow<Map<String, String>> = _nombreUsuarios

    private val _isDataLoaded = MutableStateFlow(false)
    val isDataLoaded: StateFlow<Boolean> = _isDataLoaded

    fun calcularSaldo(grupoId: String) = viewModelScope.launch {
        val gastos = repository.obtenerGastos(grupoId)
        _saldos.value = repository.calcularSaldos(gastos)
        _isDataLoaded.value = true
    }

    fun obtenerNombresUsuarios(miembros: List<String>) = viewModelScope.launch {
        _nombreUsuarios.value = repository.obtenerNombresUsuarios(miembros)
    }

    /* --------------------------------------------------------- */
    /*  NUEVO — Debes / Te deben (pull inicial + realtime)       */
    /* --------------------------------------------------------- */
    private val _debes   = MutableStateFlow(0.0)
    private val _teDeben = MutableStateFlow(0.0)

    val debes:   StateFlow<Double> = _debes
    val teDeben: StateFlow<Double> = _teDeben

    private var listenerJob: Job? = null   // cancelación al cambiar de uid

    init {
        /** Arranca con el usuario actual (si existe) */
        auth.currentUser?.uid?.let { uid ->
            pullAndStartRealtime(uid)
        }

        /** Cada vez que cambia el usuario autenticado */
        auth.addAuthStateListener { fb ->
            val uid = fb.currentUser?.uid
            if (uid == null) {
                // Logout → limpia y cancela
                listenerJob?.cancel()
                _debes.value   = 0.0
                _teDeben.value = 0.0
            } else {
                pullAndStartRealtime(uid)
            }
        }
    }

    /** Combina:
     * 1️⃣ Carga inicial por “pull”  (cargarTotalesGlobales)
     * 2️⃣ Listener en tiempo real   (getDebtFlowRealtime)
     */
    private fun pullAndStartRealtime(uid: String) {
        listenerJob?.cancel()

        listenerJob = viewModelScope.launch {
            // 1️⃣ Pull inicial
            cargarTotalesGlobales(uid)

            // 2️⃣ Listener realtime (sobrescribe cuando lleguen cambios)
            repository.getDebtFlowRealtime(uid).collect { (d, td) ->
                _debes.value   = d
                _teDeben.value = td
            }
        }
    }

    /* ---  pull que usa la lógica por grupo ya existente  --- */
    private suspend fun cargarTotalesGlobales(uid: String) {
        val gastos = repository.obtenerTodosLosGastosDelUsuario(uid)
        val (d, td) = repository.calcularDebesTeDeben(uid, gastos)
        _debes.value   = d
        _teDeben.value = td
    }
}






