package com.example.ptdapp.ui.navigation

object Destinations {
    const val LOGIN_SCREEN = "login"
    const val REGISTER_SCREEN = "register"
    const val CREATE_GASTO_SCREEN = "create_gasto/{grupoId}"
    fun createGastoRoute(grupoId: String) = "create_gasto/$grupoId"
    const val CREATE_PTD_SCREEN = "create_ptd"
    const val DETAIL_GASTO_SCREEN = "detail_gasto/{grupoId}/{gastoId}"
    fun detailGastoRoute(grupoId: String, gastoId: String) = "detail_gasto/$grupoId/$gastoId"
    const val DETAIL_PTD_SCREEN = "detail_ptd/{ptdId}"
    fun detailPTDRoute(ptdId: String) = "detail_ptd/$ptdId"
    const val HOME_SCREEN = "home"
    const val NOTIFICATION_SCREEN = "notifications"
    const val PROFILE_SCREEN = "profile"
    const val WALLET_SCREEN = "wallet"
    const val MAIN_SCREEN = "main_screen"

}
