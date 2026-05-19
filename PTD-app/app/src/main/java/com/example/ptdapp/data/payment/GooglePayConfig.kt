package com.example.ptdapp.data.payment

import org.json.JSONArray
import org.json.JSONObject


object GooglePayConfig {

    fun createPaymentDataRequest(price: String): JSONObject {
        val cardPaymentMethod = JSONObject().apply {
            put("type", "CARD")
            put("parameters", JSONObject().apply {
                put("allowedAuthMethods", JSONArray(listOf("PAN_ONLY", "CRYPTOGRAM_3DS")))
                put("allowedCardNetworks", JSONArray(listOf("VISA", "MASTERCARD")))
            })
            put("tokenizationSpecification", JSONObject().apply {
                put("type", "PAYMENT_GATEWAY")
                put("parameters", JSONObject().apply {
                    put("gateway", "example")
                    put("gatewayMerchantId", "exampleMerchantId")
                })
            })
        }

        return JSONObject().apply {
            put("apiVersion", 2)
            put("apiVersionMinor", 0)
            put("allowedPaymentMethods", JSONArray().put(cardPaymentMethod))
            put("transactionInfo", JSONObject().apply {
                put("totalPrice", price)
                put("totalPriceStatus", "FINAL")
                put("currencyCode", "EUR")
            })
            put("merchantInfo", JSONObject().apply {
                put("merchantName", "PTDApp Dev")
            })
        }
    }
}
