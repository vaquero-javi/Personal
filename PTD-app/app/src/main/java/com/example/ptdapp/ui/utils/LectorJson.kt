package com.example.ptdapp.ui.utils

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

data class PaisConCiudades(
    val pais: String,
    val ciudades: List<String>
)

fun leerPaisesDesdeJson(context: Context): List<PaisConCiudades> {
    val inputStream = context.assets.open("espana_provincias.json")
    val jsonString = inputStream.bufferedReader().use { it.readText() }
    val tipoLista = object : TypeToken<List<PaisConCiudades>>() {}.type
    return Gson().fromJson(jsonString, tipoLista)
}