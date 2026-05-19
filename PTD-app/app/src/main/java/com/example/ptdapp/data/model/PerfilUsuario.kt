package com.example.ptdapp.data.model

data class PerfilUsuario(
    val uid: String = "",
    val email: String = "",
    val nombre: String = "",
    val pais: String = "",
    val ciudad: String = "",
    val wallet: WalletData = WalletData()
)

data class WalletData(
    val balance: Double = 0.0
)

