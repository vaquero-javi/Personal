package com.example.ptdapp.ui.screens.walletScreen

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.ptdapp.data.repositories.WalletRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class WalletViewModel(
    private val walletRepository: WalletRepository = WalletRepository()
) : ViewModel() {

    /* flujo ÚNICO que observa la UI */
    private val _saldo = MutableStateFlow<Double>(0.0)
    val saldo: StateFlow<Double> = _saldo

    private val _recargaExitosa = MutableStateFlow<Boolean?>(null)
    val recargaExitosa: StateFlow<Boolean?> = _recargaExitosa

    private var _pendingAmount: Double? = null

    private var refreshJob: Job? = null

    fun refreshWallet() {
        refreshJob?.cancel()                 // evita duplicados
        refreshJob = viewModelScope.launch {
            walletRepository.getSaldoFlow()
                .collectLatest { _saldo.value = it ?: 0.0 }
        }
    }

    //init {
      //  observarSaldo()
    //}

    /** Suscribe getSaldoFlow al uid actual y alimenta _saldo */
    private fun observarSaldo() {
        viewModelScope.launch {
            walletRepository.getSaldoFlow().collect { valor ->
                valor?.let { _saldo.value = it }
            }
        }
    }

    fun setPendingAmount(amount: Double) {
        _pendingAmount = amount
    }

    fun confirmarPagoExitoso() {
        Log.d("WalletViewModel", "✅ confirmando pago exitoso con $_pendingAmount")
        _pendingAmount?.let {
            recargarSaldo(it)
            _pendingAmount = null
        } ?: Log.e("WalletViewModel", "❌ No hay monto pendiente para confirmar")
    }


    /** Tras recarga forzamos lectura inmediata (ya actúa sobre _saldo) */
    private fun recargarSaldo(amount: Double) {
        viewModelScope.launch {
            val success = walletRepository.recargarSaldo(amount)
            _recargaExitosa.value = success
            if (success) {
                walletRepository.obtenerSaldoActual { newBalance ->
                    _saldo.value = newBalance ?: _saldo.value
                }
            }
        }
    }


    fun resetearRecarga() {
        _recargaExitosa.value = null
    }

    /** Lectura manual (primer login o fallback) */
    fun loadUserBalance(userId: String) {
        viewModelScope.launch {
            walletRepository.obtenerSaldoDeUsuario(userId) { saldoRecuperado ->
                _saldo.value = saldoRecuperado ?: 0.0
            }
        }
    }


    private val _saldoReal = MutableStateFlow(0.0)
    val saldoReal: StateFlow<Double> = _saldoReal

    // Inyecta también el SaldoViewModel o los Flows de deudas
    fun setFlujosDeudas(flujoDebes: StateFlow<Double>, flujoTeDeben: StateFlow<Double>) {
        viewModelScope.launch {
            combine(saldo, flujoDebes, flujoTeDeben) { s, d, td ->
                (s ?: 0.0) + td - d
            }.collect { saldoCalculado ->
                _saldoReal.value = saldoCalculado   // Nuevo StateFlow<Double>
            }
        }
    }

}


