package com.example.ptdapp.data.repositories


import com.google.firebase.firestore.FirebaseFirestore

object UserRepository {

    private val db = FirebaseFirestore.getInstance()

    /**
     * Obtiene el nombre del usuario dado su UID.
     * Si no se encuentra, devuelve el UID como fallback.
     */
    fun getUserNameByUid(
        uid: String,
        onResult: (String) -> Unit
    ) {
        db.collection("users").document(uid)
            .get()
            .addOnSuccessListener { doc ->
                val name = doc.getString("nombre") ?: uid
                onResult(name)
            }
            .addOnFailureListener {
                onResult(uid)
            }
    }

    /**
     * Dada una lista de UIDs, devuelve un mapa de UID → nombre.
     */
    fun getUserNamesByUids(
        uids: List<String>,
        onResult: (Map<String, String>) -> Unit
    ) {
        if (uids.isEmpty()) {
            onResult(emptyMap())
            return
        }

        val resultMap = mutableMapOf<String, String>()
        var loadedCount = 0

        uids.forEach { uid ->
            getUserNameByUid(uid) { name ->
                resultMap[uid] = name
                loadedCount++
                if (loadedCount == uids.size) {
                    onResult(resultMap)
                }
            }
        }
    }

    /**
     * Obtiene el país y ciudad de un usuario (si se necesitan más adelante).
     */
    fun getUserLocationByUid(
        uid: String,
        onResult: (pais: String?, ciudad: String?) -> Unit
    ) {
        db.collection("users").document(uid)
            .get()
            .addOnSuccessListener { doc ->
                val pais = doc.getString("pais")
                val ciudad = doc.getString("ciudad")
                onResult(pais, ciudad)
            }
            .addOnFailureListener {
                onResult(null, null)
            }
    }
}
