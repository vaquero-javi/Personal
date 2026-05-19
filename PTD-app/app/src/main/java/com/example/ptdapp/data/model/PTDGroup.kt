package com.example.ptdapp.data.model

import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

data class PTDGroup(
    val id: String = "",
    val adminId: String = "",
    val nombre: String = "",
    val descripcion: String = "",
    val iconoNombre: String = "image", // 👈 Guarda el nombre del drawable, no el ID
    val miembros: MutableList<String> = mutableListOf(),
    val gastos: MutableList<Gasto> = mutableListOf(),
    @ServerTimestamp
    val createdAt: Date? = null
)


