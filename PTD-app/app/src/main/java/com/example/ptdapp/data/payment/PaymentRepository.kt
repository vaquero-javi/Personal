package com.example.ptdapp.data.payment

import android.app.Activity
import android.content.Context
import com.google.android.gms.wallet.AutoResolveHelper
import com.google.android.gms.wallet.PaymentDataRequest
import com.google.android.gms.wallet.Wallet
import com.google.android.gms.wallet.WalletConstants

class PaymentRepository {

    fun launchGooglePay(
        context: Context,
        amount: String,
        activity: Activity
    ) {
        val paymentsClient = Wallet.getPaymentsClient(
            context,
            Wallet.WalletOptions.Builder()
                .setEnvironment(WalletConstants.ENVIRONMENT_TEST)
                .build()
        )

        val paymentDataRequest = GooglePayConfig.createPaymentDataRequest(amount)
        val request = PaymentDataRequest.fromJson(paymentDataRequest.toString())

        AutoResolveHelper.resolveTask(
            paymentsClient.loadPaymentData(request),
            activity,
            GOOGLE_PAY_REQUEST_CODE
        )
    }

    companion object {
        const val GOOGLE_PAY_REQUEST_CODE = 991
    }
}
