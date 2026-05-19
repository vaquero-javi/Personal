package com.example.ptdapp.ui.authViewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.ptdapp.data.model.PerfilUsuario
import com.example.ptdapp.data.model.WalletData
import com.example.ptdapp.data.repositories.AuthRepository
import com.example.ptdapp.data.repositories.ProfileRepository
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class AuthViewModel(
    private val repository: AuthRepository,
    private val profileRepository: ProfileRepository
) : ViewModel() {


    private val _user = MutableStateFlow<FirebaseUser?>(repository.getCurrentUser())
    val user: StateFlow<FirebaseUser?> = _user

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _isLoading.value = true
            val result = repository.login(email, password)
            _isLoading.value = false

            result.onSuccess { firebaseUser ->
                _user.value = firebaseUser
                _errorMessage.value = null // Limpia el error si el login es exitoso
                crearDocumentoUsuarioSiNoExiste()
            }.onFailure { exception ->
                _errorMessage.value = getAuthErrorMessage(exception.message)
            }
        }
    }

    fun register(email: String, password: String) {
        viewModelScope.launch {
            _isLoading.value = true
            val result = repository.register(email, password)
            _isLoading.value = false

            result.onSuccess { firebaseUser ->
                _user.value = firebaseUser
                _errorMessage.value = null // Limpia el error si el registro es exitoso
                crearDocumentoUsuarioSiNoExiste()
            }.onFailure { exception ->
                _errorMessage.value = getAuthErrorMessage(exception.message)
            }
        }
    }

    fun logout() {
        repository.logout()
        _user.value = null
    }

    private fun crearDocumentoUsuarioSiNoExiste() {
        val user = repository.getCurrentUser() ?: return
        val uid = user.uid
        val email = user.email ?: return

        // Creamos un PerfilUsuario con saldo inicial
        val nombreDefecto = email.substringBefore("@").replaceFirstChar { it.uppercase() }
        val perfil = PerfilUsuario(
            uid = uid,
            email = email,
            nombre = nombreDefecto,
            pais = "",
            ciudad = "",
            wallet = WalletData(balance = 0.0)
        )

        val db = FirebaseFirestore.getInstance()
        val userRef = db.collection("users").document(uid)

        userRef.get().addOnSuccessListener { document ->
            if (!document.exists()) {
                // Aquí ya podemos llamarla
                viewModelScope.launch {
                    profileRepository.crearPerfilInicial(perfil)
                }
            }
        }
    }


    fun resetPassword(email: String) {
        viewModelScope.launch {
            _isLoading.value = true
            val result = repository.resetPassword(email)
            _isLoading.value = false

            result.onSuccess {
                _errorMessage.value = "Correo de recuperación enviado"
            }.onFailure { exception ->
                _errorMessage.value = exception.message
            }
        }
    }

    private fun getAuthErrorMessage(errorCode: String?): String {
        return when {
            errorCode == null -> "Ha ocurrido un error inesperado. Inténtalo de nuevo."

            // Errores de correo
            errorCode.contains(
                "INVALID_EMAIL",
                ignoreCase = true
            ) -> "El correo ingresado no es válido. Verifica la dirección."

            errorCode.contains(
                "EMAIL_NOT_FOUND",
                ignoreCase = true
            ) -> "No existe una cuenta con este correo. Verifica la dirección o regístrate."

            errorCode.contains(
                "EMAIL_ALREADY_IN_USE",
                ignoreCase = true
            ) -> "Este correo ya está registrado. Intenta iniciar sesión o usa otro correo."

            errorCode.contains(
                "MISSING_EMAIL",
                ignoreCase = true
            ) -> "Por favor, ingresa un correo electrónico."

            // Errores de contraseña
            errorCode.contains(
                "MISSING_PASSWORD",
                ignoreCase = true
            ) -> "Debes ingresar una contraseña."

            errorCode.contains(
                "INVALID_PASSWORD",
                ignoreCase = true
            ) -> "La contraseña ingresada es incorrecta. Inténtalo de nuevo."

            errorCode.contains(
                "WEAK_PASSWORD",
                ignoreCase = true
            ) -> "Tu contraseña es demasiado débil. Usa al menos 6 caracteres, combinando letras y números."

            errorCode.contains(
                "PASSWORD_TOO_SHORT",
                ignoreCase = true
            ) -> "La contraseña debe tener al menos 6 caracteres."

            errorCode.contains(
                "WRONG_PASSWORD",
                ignoreCase = true
            ) -> "La contraseña es incorrecta. Inténtalo de nuevo o restablece tu contraseña."

            // Errores de intentos y bloqueos
            errorCode.contains(
                "TOO_MANY_ATTEMPTS_TRY_LATER",
                ignoreCase = true
            ) -> "Has intentado demasiadas veces. Espera unos minutos antes de intentarlo de nuevo."

            errorCode.contains(
                "USER_DISABLED",
                ignoreCase = true
            ) -> "Esta cuenta ha sido deshabilitada. Contacta al soporte para más información."

            // Errores de autenticación
            errorCode.contains(
                "USER_NOT_FOUND",
                ignoreCase = true
            ) -> "No existe una cuenta con este correo. Verifica la dirección o regístrate."

            errorCode.contains(
                "INVALID_CREDENTIAL",
                ignoreCase = true
            ) -> "Las credenciales ingresadas no son correctas. Verifica tu correo y contraseña."

            errorCode.contains(
                "OPERATION_NOT_ALLOWED",
                ignoreCase = true
            ) -> "Este método de autenticación no está habilitado. Contacta al soporte."

            // Errores de cuenta y acceso
            errorCode.contains("ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL", ignoreCase = true) ->
                "Ya existe una cuenta asociada a este correo con otro método de inicio de sesión. Intenta con Google o Facebook."

            errorCode.contains(
                "CREDENTIAL_ALREADY_IN_USE",
                ignoreCase = true
            ) -> "Estas credenciales ya están en uso en otra cuenta."

            // Errores de red y conexión
            errorCode.contains(
                "NETWORK_REQUEST_FAILED",
                ignoreCase = true
            ) -> "Error de conexión. Verifica tu conexión a internet e intenta nuevamente."

            errorCode.contains(
                "TIMEOUT",
                ignoreCase = true
            ) -> "El servidor tardó demasiado en responder. Inténtalo de nuevo."

            else -> "Error desconocido. Verifica tus datos e inténtalo nuevamente."
        }
    }


}
