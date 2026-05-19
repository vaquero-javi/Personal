package com.example.ptdapp.ui.utils


import java.text.NumberFormat
import java.util.*

object PaymentUtils {

    /**
     * Formatea un valor decimal como precio en euros.
     * Ejemplo: 10.5 -> "10,50 €"
     */
    fun formatPrice(amount: Double): String {
        val format = NumberFormat.getCurrencyInstance(Locale("es", "ES"))
        format.currency = Currency.getInstance("EUR")
        return format.format(amount)
    }

    /**
     * Valida que el monto sea positivo y no cero.
     */
    fun isAmountValid(amount: Double): Boolean {
        return amount > 0.0
    }

    /**
     * Genera un ID de transacción simple para pagos simulados.
     */
    fun generateTransactionId(): String {
        return UUID.randomUUID().toString()
    }
}
