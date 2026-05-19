package com.example.ptdapp.data.repositories

import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class WalletRepository(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val notificationsRepository: NotificationsRepository = NotificationsRepository()
) {

    // 🔄 Flow para observar el saldo en tiempo real
    fun getSaldoFlow(): Flow<Double?> = callbackFlow {
        val userId = auth.currentUser?.uid ?: run {
            close()
            return@callbackFlow
        }

        val ref = firestore.collection("users").document(userId)

        val listener = ref.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.e("WalletRepository", "Error escuchando saldo", error)
                trySend(null)
                return@addSnapshotListener
            }

            if (snapshot != null && snapshot.exists()) {
                val balance = snapshot.getDouble("wallet.balance")
                trySend(balance)
            } else {
                trySend(null)
            }
        }

        awaitClose { listener.remove() }
    }

    suspend fun obtenerSaldoActual(onResult: (Double?) -> Unit) {
        val userId = auth.currentUser?.uid ?: return
        val docRef = firestore.collection("users").document(userId)

        try {
            val snapshot = docRef.get().await()
            val balance = snapshot.getDouble("wallet.balance")
            onResult(balance)
        } catch (e: Exception) {
            Log.e("WalletRepository", "Error al obtener saldo actual", e)
            onResult(null)
        }
    }


    // 💳 Recargar saldo (crea documento automáticamente si no existe)
    suspend fun recargarSaldo(amount: Double): Boolean {
        val userId = auth.currentUser?.uid ?: return false
        val userRef = firestore.collection("users").document(userId)

        return try {
            firestore.runTransaction { transaction ->
                val snapshot = transaction.get(userRef)
                if (!snapshot.exists()) {
                    transaction.set(userRef, mapOf("wallet" to mapOf("balance" to amount)))
                } else {
                    val currentBalance = snapshot.getDouble("wallet.balance") ?: 0.0
                    transaction.update(userRef, "wallet.balance", currentBalance + amount)
                }
            }.await()

            registrarTransaccion(userId, amount, "GooglePay")
            notificationsRepository.crearNotificacionIngreso(amount)
            true
        } catch (e: Exception) {
            Log.e("WalletRepository", "❌ Error Firebase", e)
            false
        }
    }


    // 📝 Registrar transacción dentro del usuario (subcolección)
    suspend fun registrarTransaccion(userId: String, amount: Double, method: String) {
        val transaccion = mapOf(
            "amount" to amount,
            "method" to method,
            "timestamp" to FieldValue.serverTimestamp()
        )

        firestore.collection("users")
            .document(userId)
            .collection("transactions")
            .add(transaccion)
            .await()
    }



    fun obtenerSaldoDeUsuario(userId: String, callback: (Double?) -> Unit) {
        firestore.collection("users").document(userId).get()
            .addOnSuccessListener { document ->
                if (document.exists()) {
                    val walletMap = document.get("wallet") as? Map<*, *>
                    val saldo = walletMap?.get("balance") as? Double ?: 0.0
                    Log.d("WalletRepository", "✅ Saldo recuperado correctamente: $saldo")
                    callback(saldo)
                } else {
                    Log.e("WalletRepository", "⚠️ Documento del usuario no existe.")
                    callback(null)
                }
            }
            .addOnFailureListener { exception ->
                Log.e("WalletRepository", "❌ Error al obtener saldo", exception)
                callback(null)
            }
    }
}
