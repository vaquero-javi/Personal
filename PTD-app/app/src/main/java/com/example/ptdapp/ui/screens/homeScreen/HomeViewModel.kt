package com.example.ptdapp.ui.viewmodel

import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import com.example.ptdapp.data.model.PTDGroup
import com.google.firebase.auth.ktx.auth
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase

class HomeViewModel : ViewModel() {

    private val firestore = Firebase.firestore
    private val auth = Firebase.auth

    var gruposUsuario = mutableStateOf<List<PTDGroup>>(emptyList())
        private set

    var isLoading = mutableStateOf(true) // 👈 Añadido para mostrar el spinner
        private set

    fun cargarGruposDelUsuario() {
        val currentUserId = auth.currentUser?.uid ?: return

        isLoading.value = true

        firestore.collection("grupos")
            .whereArrayContains("miembros", currentUserId)
            .get()
            .addOnSuccessListener { result ->
                val grupos = result.documents.mapNotNull { it.toObject(PTDGroup::class.java) }
                gruposUsuario.value = grupos
                isLoading.value = false
            }
            .addOnFailureListener { e ->
                e.printStackTrace()
                isLoading.value = false
            }
    }
}
