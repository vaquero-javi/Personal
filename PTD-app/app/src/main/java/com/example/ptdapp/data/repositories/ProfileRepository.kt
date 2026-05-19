package com.example.ptdapp.data.repositories

import com.example.ptdapp.data.model.PerfilUsuario
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

class ProfileRepository {
    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()

    /**
     * Crea el documento del usuario en Firestore con toda la info de PerfilUsuario.
     * Ideal llamarlo inmediatamente después de registrar al usuario, para que "wallet.balance" esté inicializado.
     */
    suspend fun crearPerfilInicial(perfil: PerfilUsuario): Boolean {
        val uid = auth.currentUser?.uid ?: return false
        db.collection("users")
            .document(uid)
            .set(perfil) // Guarda el objeto entero, incluyendo wallet
            .await()
        return true
    }

    /**
     * Obtiene el perfil completo del usuario (incluyendo el campo wallet, si existe).
     */
    suspend fun obtenerPerfil(): PerfilUsuario? {
        val uid = auth.currentUser?.uid ?: return null
        val doc = db.collection("users").document(uid).get().await()
        return doc.toObject(PerfilUsuario::class.java)
    }

    /**
     * Actualiza sólo los campos básicos del perfil (nombre, país, ciudad),
     * sin sobrescribir los demás campos (como "wallet").
     */
    suspend fun actualizarPerfil(nombre: String, pais: String, ciudad: String): Boolean {
        val uid = auth.currentUser?.uid ?: return false
        val updates = mapOf(
            "nombre" to nombre,
            "pais" to pais,
            "ciudad" to ciudad
        )
        db.collection("users")
            .document(uid)
            .update(updates)
            .await()
        return true
    }
}

