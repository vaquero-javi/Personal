package com.example.ptdapp.data.repositories

import com.example.ptdapp.data.model.Gasto
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class GastoRepository {

    private val db = FirebaseFirestore.getInstance()

    fun crearGasto(
        grupoId: String,
        gasto: Gasto,
        onSuccess: () -> Unit,
        onFailure: (Exception) -> Unit
    ) {
        val gastoId = db.collection("grupos")
            .document(grupoId)
            .collection("gastos")
            .document().id

        val nuevoGasto = gasto.copy(id = gastoId)

        db.collection("grupos")
            .document(grupoId)
            .collection("gastos")
            .document(gastoId)
            .set(nuevoGasto)
            .addOnSuccessListener { onSuccess() }
            .addOnFailureListener { onFailure(it) }
    }

    fun getGastosFlow(grupoId: String): Flow<List<Gasto>> = callbackFlow {
        val ref = db.collection("grupos")
            .document(grupoId)
            .collection("gastos")

        val listener: ListenerRegistration = ref.addSnapshotListener { snapshot, error ->
            if (error != null) {
                trySend(emptyList()).isSuccess
                return@addSnapshotListener
            }

            val gastos = snapshot?.documents?.mapNotNull { it.toObject(Gasto::class.java) } ?: emptyList()
            trySend(gastos).isSuccess
        }

        awaitClose { listener.remove() }
    }

    suspend fun obtenerGastos(grupoId: String): List<Gasto> {
        return try {
            val snapshot = db.collection("grupos")
                .document(grupoId)
                .collection("gastos")
                .get()
                .await()

            snapshot.documents.mapNotNull { it.toObject(Gasto::class.java) }
        } catch (e: Exception) {
            emptyList()
        }
    }

}
