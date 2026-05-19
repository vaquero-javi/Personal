package com.example.ptdapp.data.repositories

import com.example.ptdapp.data.model.Gasto
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class SaldoRepository {

    private val db = FirebaseFirestore.getInstance()

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

    fun calcularSaldos(gastos: List<Gasto>): Map<String, Double> {
        val saldos = mutableMapOf<String, Double>()

        for (gasto in gastos) {
            val pagador = gasto.pagadoPor
            val cantidadPorPersona = gasto.cantidad / gasto.divididoEntre.size

            // Suma al que pagó
            saldos[pagador] = saldos.getOrDefault(pagador, 0.0) + gasto.cantidad

            // Resta a los que deben
            gasto.divididoEntre.forEach { uid ->
                saldos[uid] = saldos.getOrDefault(uid, 0.0) - cantidadPorPersona
            }
        }

        return saldos
    }

    suspend fun obtenerNombresUsuarios(miembros: List<String>): Map<String, String> {
        val nombresMap = mutableMapOf<String, String>()
        val db = FirebaseFirestore.getInstance()

        miembros.forEach { uid ->
            try {
                val doc = db.collection("users").document(uid).get().await()
                val nombre = doc.getString("nombre") ?: uid
                nombresMap[uid] = nombre
            } catch (_: Exception) {
                nombresMap[uid] = uid // fallback
            }
        }

        return nombresMap
    }

    suspend fun obtenerTodosLosGastosDelUsuario(uid: String): List<Gasto> {
        val db = FirebaseFirestore.getInstance()
        val grupos = db.collection("grupos").whereArrayContains("miembros", uid).get().await()

        val gastos = mutableListOf<Gasto>()
        for (groupDoc in grupos.documents) {
            val snapshot = groupDoc.reference
                .collection("gastos")
                .get()
                .await()
            gastos += snapshot.toObjects(Gasto::class.java)
        }
        return gastos
    }

    /** Devuelve (debes, teDeben) para UID concreto */
    fun calcularDebesTeDeben(uid: String, gastos: List<Gasto>): Pair<Double, Double> {
        var debes = 0.0
        var teDeben = 0.0

        for (gasto in gastos) {
            val share = gasto.cantidad / gasto.divididoEntre.size

            if (gasto.pagadoPor == uid) {
                // Yo pagué: los demás me deben su parte
                teDeben += gasto.cantidad - share         // importe menos mi parte
            } else if (gasto.divididoEntre.contains(uid)) {
                // No pagué pero participo: debo mi parte
                debes += share
            }
        }
        return debes to teDeben
    }

    /** (debes, teDeben) realtime — sin lecturas extra */
    fun getDebtFlowRealtime(uid: String): Flow<Pair<Double, Double>> = callbackFlow {
        val db = FirebaseFirestore.getInstance()

        /* Mapa: grupoId -> Pair(debes, teDeben) */
        val groupTotals = mutableMapOf<String, Pair<Double, Double>>()
        val expenseListeners = mutableMapOf<String, ListenerRegistration>()

        /* Escucha los grupos activos */
        val groupsListener = db.collection("grupos")
            .whereArrayContains("miembros", uid)
            .addSnapshotListener { groupSnap, err ->
                if (err != null) {
                    trySend(0.0 to 0.0); return@addSnapshotListener
                }

                val activeIds = groupSnap?.documents?.map { it.id } ?: emptyList()

                /* 1️⃣ elimina listeners de grupos abandonados */
                expenseListeners.keys
                    .filterNot { it in activeIds }
                    .forEach { gid ->
                        expenseListeners.remove(gid)?.remove()
                        groupTotals.remove(gid)                      // quita sus totales
                    }

                /* 2️⃣ crea listener para cada grupo nuevo */
                activeIds.forEach { gid ->
                    if (gid !in expenseListeners) {
                        val l = db.collection("grupos").document(gid)
                            .collection("gastos")
                            .addSnapshotListener { expSnap, _ ->
                                var d = 0.0
                                var td = 0.0

                                expSnap?.documents?.forEach { doc ->
                                    val g = doc.toObject(Gasto::class.java) ?: return@forEach
                                    val share = g.cantidad / g.divididoEntre.size
                                    when (uid) {
                                        g.pagadoPor -> td += g.cantidad - share
                                        in g.divididoEntre -> d += share
                                    }
                                }
                                /* actualiza mapa y emite suma global */
                                groupTotals[gid] = d to td
                                val totalDebes = groupTotals.values.sumOf { it.first }
                                val totalTeDeben = groupTotals.values.sumOf { it.second }
                                trySend(totalDebes to totalTeDeben)
                            }
                        expenseListeners[gid] = l
                    }
                }

                /* Si no hay grupos → envía cero (vacía la UI) */
                if (activeIds.isEmpty()) trySend(0.0 to 0.0)
            }

        awaitClose {
            groupsListener.remove()
            expenseListeners.values.forEach { it.remove() }
        }
    }

}


