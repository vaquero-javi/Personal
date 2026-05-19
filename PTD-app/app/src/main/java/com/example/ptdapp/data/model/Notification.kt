package com.example.ptdapp.data.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.Exclude

data class Notification(
    val title: String = "",
    val description: String = "",
    val timestamp: Timestamp? = null,
    val read: Boolean = false
) {
    @get:Exclude
    var id: String = ""
}
