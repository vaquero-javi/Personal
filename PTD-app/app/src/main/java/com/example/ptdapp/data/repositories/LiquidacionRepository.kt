package com.example.ptdapp.data.repositories

import com.example.ptdapp.data.model.Gasto
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import com.example.ptdapp.data.model.PerfilUsuario
import com.google.firebase.firestore.FieldValue


class LiquidacionRepository {


    private val db = FirebaseFirestore.getInstance()
    private val walletRepository = WalletRepository()


    suspend fun liquidarGrupo(grupoId: String): Result<Unit> {
        return try {
            val gastosSnapshot = db.collection("grupos")
                .document(grupoId)
                .collection("gastos")
                .get()
                .await()

            val gastos = gastosSnapshot.documents.mapNotNull { it.toObject(Gasto::class.java) }

            val saldos = mutableMapOf<String, Double>()
            for (gasto in gastos) {
                val pagador = gasto.pagadoPor
                val cantidadPorPersona = gasto.cantidad / gasto.divididoEntre.size

                saldos[pagador] = saldos.getOrDefault(pagador, 0.0) + gasto.cantidad

                gasto.divididoEntre.forEach { uid ->
                    saldos[uid] = saldos.getOrDefault(uid, 0.0) - cantidadPorPersona
                }
            }

            val perfiles = saldos.keys.associateWith { uid ->
                val doc = db.collection("users").document(uid).get().await()
                doc.toObject(PerfilUsuario::class.java)
            }

            for ((uid, cambio) in saldos) {
                val perfil = perfiles[uid] ?: continue
                val nuevoSaldo = perfil.wallet.balance + cambio

                db.collection("users").document(uid)
                    .update("wallet.balance", nuevoSaldo)
                    .await()

                // ➕ Registrar transacción (positivo = ingreso, negativo = gasto)
                walletRepository.registrarTransaccion(uid, cambio,"Liquidacion de grupo")


            }

            db.collection("grupos").document(grupoId)
                .update("miembros", emptyList<String>())
                .await()

            Result.success(Unit)

        } catch (e: Exception) {
            Result.failure(e)
        }
    }

}


