package com.example.ptdapp.data.repositories

import android.util.Log
import com.example.ptdapp.data.model.Notification
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await


class NotificationsRepository {

    private val firestore = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()

    fun getNotificationsFlow(): Flow<List<Notification>> = callbackFlow {
        val userId = auth.currentUser?.uid ?: run {
            close() // cerramos el flujo si no hay usuario
            return@callbackFlow
        }

        val ref = firestore.collection("users")
            .document(userId)
            .collection("notifications")
            .orderBy("timestamp", Query.Direction.DESCENDING)
        val listener = ref.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.e("NotificationsRepository", "Error al obtener notificaciones", error)
                trySend(emptyList()) // mandamos lista vacía para desbloquear el ViewModel
                return@addSnapshotListener
            }

            if (snapshot != null) {
                val notifications = snapshot.documents.mapNotNull { doc ->
                    doc.toObject(Notification::class.java)?.apply {
                        id = doc.id
                    }
                }

                trySend(notifications)
            } else {
                trySend(emptyList())
            }
        }

        awaitClose { listener.remove() }
    }

    suspend fun crearNotificacionIngreso(amount: Double) {
        val userId = auth.currentUser?.uid ?: return

        val notificacion = mapOf(
            "title" to "Ingreso exitoso",
            "description" to "Se han ingresado ${String.format("%.2f €", amount)} a tu cuenta.",
            "timestamp" to FieldValue.serverTimestamp(),
            "read" to false
        )


        firestore.collection("users")
            .document(userId)
            .collection("notifications")
            .add(notificacion)
            .await()
    }


    suspend fun deleteNotification(id: String) {
        val userId = auth.currentUser?.uid ?: return
        firestore.collection("users").document(userId).collection("notifications").document(id)
            .delete().await()
    }

    suspend fun notificarIngresoAGrupo(grupoNombre: String, miembros: List<String>) {
        val actualUserId = auth.currentUser?.uid ?: return

        // 🔹 Obtener el nombre del usuario actual
        val userDoc = firestore.collection("users").document(actualUserId).get().await()
        val nombreUsuario = userDoc.getString("nombre") ?: "Alguien"

        val notificacion = mapOf(
            "title" to "Nuevo miembro en el grupo",
            "description" to "$nombreUsuario se ha unido al grupo \"$grupoNombre\".",
            "timestamp" to FieldValue.serverTimestamp(),
            "read" to false
        )

        miembros
            .filter { it != actualUserId }
            .forEach { uid ->
                firestore.collection("users")
                    .document(uid)
                    .collection("notifications")
                    .add(notificacion)
                    .await()
            }
    }
    suspend fun notificarLiquidacionDeudas(grupoNombre: String, miembros: List<String>) {
        val actualUserId = auth.currentUser?.uid ?: return

        val userDoc = firestore.collection("users").document(actualUserId).get().await()
        val nombreUsuario = userDoc.getString("nombre") ?: "El administrador"

        val notificacion = mapOf(
            "title" to "Grupo liquidado",
            "description" to "$nombreUsuario ha saldado todas las deudas en el grupo \"$grupoNombre\".",
            "timestamp" to FieldValue.serverTimestamp(),
            "read" to false
        )

        miembros
            .filter { it != actualUserId }
            .forEach { uid ->
                firestore.collection("users")
                    .document(uid)
                    .collection("notifications")
                    .add(notificacion)
                    .await()
            }
    }



}


