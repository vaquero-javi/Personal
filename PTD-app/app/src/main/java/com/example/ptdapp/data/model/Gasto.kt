package com.example.ptdapp.data.model

import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

data class Gasto(
    val id: String = "",
    val titulo: String = "",
    val cantidad: Double = 0.0,
    val pagadoPor: String = "",
    val divididoEntre: List<String> = emptyList(),
    val iconoNombre: String = "",
    val descripcion: String = "",
    @ServerTimestamp
    val fecha: Date? = null
)
