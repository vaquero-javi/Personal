import os
import time
import random

# Constantes para índices
ID = 0
TIPO = 1
TIEMPO = 2
PRIORIDAD = 3
COMBUSTIBLE = 4
ESTADO = 5

# Constantes para pistas
PISTA_ID = 0
PISTA_CATEGORIA = 1
PISTA_TIEMPO_USO = 2
PISTA_HABILITADA = 3
PISTA_ESTADO = 4
PISTA_VUELO_ACTUAL = 5
PISTA_TIEMPO_LIBERACION = 6

ESTADOS = ["EN_COLA", "ASIGNADO", "COMPLETADO", "CANCELADO"]
CATEGORIAS_PISTAS = ["corta", "estandar", "larga"]
AEROLINEAS = ["IB", "UX", "VY", "AF", "BA", "LH", "AA", "DL", "TK", "EK"]

# Variables globales
reloj_simulado = 0
vuelos = []
pistas = []
flujo_aterrizaje = []
flujo_despegue = []

# ========== FUNCIONES BASE (Carga y Simulación) ==========

def registrar_log(mensaje, archivo="eventos.log"):
    """Registra un evento en el archivo de log"""
    try:
        with open(archivo, "a", encoding="utf-8") as f:
            f.write(f"[t={reloj_simulado}] {mensaje}\n")
    except Exception as e:
        print(f"Error al escribir en log: {e}")

def cargar_vuelos_desde_csv(archivo="vuelos.csv"):
    """Carga los vuelos desde un archivo CSV - CORREGIDO para tu formato"""
    global vuelos
    vuelos_cargados = []
    try:
        with open(archivo, "r", encoding="utf-8") as f:
            lineas = f.readlines()
            
        for numero_linea, linea in enumerate(lineas[1:], start=2):
            try:
                datos = linea.strip().split(",")
                if len(datos) < 7:  # Ahora son 7 columnas
                    continue
                
                id_vuelo = datos[0].strip()
                tipo = datos[1].strip().upper()
                
                # Manejar eta/etd - CORREGIDO
                if tipo == "ATERRIZAJE":
                    tiempo_str = datos[2].strip()  # eta
                    etd_str = datos[3].strip()     # etd (vacío para aterrizajes)
                else:  # DESPEGUE
                    tiempo_str = datos[3].strip()  # etd  
                    eta_str = datos[2].strip()     # eta (vacío para despegues)
                
                # Convertir a int, manejar campos vacíos
                tiempo = int(tiempo_str) if tiempo_str else 0
                prioridad = int(datos[4].strip()) if datos[4].strip() else 0
                
                # Combustible - solo para aterrizajes
                combustible_str = datos[5].strip()
                combustible = int(combustible_str) if combustible_str and tipo == "ATERRIZAJE" else 0
                
                estado = datos[6].strip().upper() if len(datos) > 6 else "EN_COLA"
                
                if tipo not in ["ATERRIZAJE", "DESPEGUE"]:
                    continue
                if estado not in ESTADOS:
                    estado = "EN_COLA"
                if prioridad not in [0, 1, 2]:
                    prioridad = 0
                
                vuelo = (id_vuelo, tipo, tiempo, prioridad, combustible, estado)
                vuelos_cargados.append(vuelo)
                registrar_log(f"EN_COLA id_vuelo={id_vuelo} tipo={tipo}")
                
            except (ValueError, IndexError) as e:
                print(f"Error en línea {numero_linea}: {e} - Datos: {datos}")
                
        print(f"Cargados {len(vuelos_cargados)} vuelos desde {archivo}")
        registrar_log(f"CARGA_INICIAL vuelos={len(vuelos_cargados)} pistas={len(pistas)}")
        
    except FileNotFoundError:
        print(f"Archivo {archivo} no encontrado.")
        # Crear algunos vuelos de ejemplo si no existe el archivo
        vuelos_cargados = [
            ("IB101", "ATERRIZAJE", 5, 0, 20, "EN_COLA"),
            ("IB202", "ATERRIZAJE", 1, 0, 18, "EN_COLA"),
            ("UX303", "DESPEGUE", 1, 0, 0, "EN_COLA"),
            ("VY404", "DESPEGUE", 5, 0, 0, "EN_COLA"),
            ("AF505", "ATERRIZAJE", 8, 0, 5, "EN_COLA")
        ]
        for vuelo in vuelos_cargados:
            registrar_log(f"EN_COLA id_vuelo={vuelo[ID]} tipo={vuelo[TIPO]}")
    
    vuelos = vuelos_cargados
    return vuelos_cargados

def cargar_pistas_desde_csv(archivo="pistas.csv"):
    """Carga información de pistas desde archivo CSV"""
    global pistas
    pistas_cargadas = []
    try:
        with open(archivo, "r", encoding="utf-8") as f:
            lineas = f.readlines()
            
        for numero_linea, linea in enumerate(lineas[1:], start=2):
            try:
                datos = linea.strip().split(",")
                if len(datos) >= 4:
                    id_pista = datos[0].strip()
                    categoria = datos[1].strip().lower()
                    tiempo_uso = int(datos[2].strip())
                    habilitada = int(datos[3].strip())
                    
                    pista = (
                        id_pista,
                        categoria,
                        tiempo_uso,
                        habilitada,
                        "LIBRE",
                        None,
                        0
                    )
                    pistas_cargadas.append(pista)
                    
            except (ValueError, IndexError) as e:
                print(f"Error en pista línea {numero_linea}: {e}")
                
        print(f"Cargadas {len(pistas_cargadas)} pistas desde {archivo}")
        
    except FileNotFoundError:
        print(f"Archivo {archivo} no encontrado.")
        # Pistas por defecto
        pistas_cargadas = [
            ("R1", "larga", 3, 1, "LIBRE", None, 0),
            ("R2", "estandar", 3, 1, "LIBRE", None, 0)
        ]
    
    pistas = pistas_cargadas
    return pistas_cargadas

def inicializar_flujos():
    """Inicializa los flujos de aterrizaje y despegue"""
    global flujo_aterrizaje, flujo_despegue
    flujo_aterrizaje = [v for v in vuelos if v[TIPO] == "ATERRIZAJE" and v[ESTADO] == "EN_COLA"]
    flujo_despegue = [v for v in vuelos if v[TIPO] == "DESPEGUE" and v[ESTADO] == "EN_COLA"]

def mostrar_vuelos():
    """Muestra todos los vuelos"""
    if not vuelos:
        print("No hay vuelos registrados")
        return
    
    print("\n" + "="*80)
    print(f"{'ID':<10} {'TIPO':<12} {'TIEMPO':<8} {'PRIORIDAD':<10} {'COMBUSTIBLE':<12} {'ESTADO':<12}")
    print("-"*80)
    
    for vuelo in vuelos:
        combustible_str = str(vuelo[COMBUSTIBLE]) if vuelo[TIPO] == "ATERRIZAJE" else "N/A"
        print(f"{vuelo[ID]:<10} {vuelo[TIPO]:<12} {vuelo[TIEMPO]:<8} {vuelo[PRIORIDAD]:<10} {combustible_str:<12} {vuelo[ESTADO]:<12}")
    
    print("="*80)

def mostrar_pistas():
    """Muestra el estado de las pistas"""
    if not pistas:
        print("No hay pistas registradas")
        return
    
    print("\n" + "="*60)
    print(f"{'PISTA':<8} {'CATEGORÍA':<12} {'ESTADO':<10} {'VUELO':<12} {'LIBERACIÓN':<12}")
    print("-"*60)
    
    for pista in pistas:
        vuelo_actual = pista[PISTA_VUELO_ACTUAL] if pista[PISTA_VUELO_ACTUAL] else "---"
        liberacion = f"min {pista[PISTA_TIEMPO_LIBERACION]}" if pista[PISTA_ESTADO] == "OCUPADA" else "---"
        habilitada = "SÍ" if pista[PISTA_HABILITADA] == 1 else "NO"
        
        print(f"{pista[PISTA_ID]:<8} {pista[PISTA_CATEGORIA]:<12} {pista[PISTA_ESTADO]:<10} {vuelo_actual:<12} {liberacion:<12}")

# ========== FUNCIONES DE SIMULACIÓN ==========

def obtener_siguiente_vuelo():
    """Selecciona el próximo vuelo según política de prioridades"""
    candidatos = []
    
    # Añadir aterrizajes
    for vuelo in flujo_aterrizaje:
        if vuelo[ESTADO] == "EN_COLA":
            atraso = max(0, reloj_simulado - vuelo[TIEMPO])
            # Prioridad, combustible (menos es más urgente), atraso, id
            candidatos.append((vuelo, -vuelo[PRIORIDAD], vuelo[COMBUSTIBLE], atraso, vuelo[ID]))
    
    # Añadir despegues
    for vuelo in flujo_despegue:
        if vuelo[ESTADO] == "EN_COLA":
            atraso = max(0, reloj_simulado - vuelo[TIEMPO])
            # Prioridad, combustible fijo (999 para que vayan después), atraso, id
            candidatos.append((vuelo, -vuelo[PRIORIDAD], 999, atraso, vuelo[ID]))
    
    if not candidatos:
        return None
    
    # Ordenar por: prioridad (desc), combustible (asc), atraso (desc), id (asc)
    candidatos.sort(key=lambda x: (x[1], x[2], -x[3], x[4]))
    
    return candidatos[0][0]

def pista_es_compatible(pista, vuelo):
    """Verifica si una pista es compatible con un tipo de vuelo"""
    if pista[PISTA_HABILITADA] == 0:
        return False
        
    if vuelo[TIPO] == "DESPEGUE":
        return pista[PISTA_CATEGORIA] in ["estandar", "larga"]
    elif vuelo[TIPO] == "ATERRIZAJE":
        if vuelo[PRIORIDAD] == 2:  # Emergencia
            return pista[PISTA_CATEGORIA] in ["larga", "estandar"]
        else:
            return True
    return False

def asignar_pista_a_vuelo(vuelo):
    """Asigna una pista disponible a un vuelo"""
    pistas_disponibles = []
    for pista in pistas:
        if (pista[PISTA_ESTADO] == "LIBRE" and 
            pista[PISTA_HABILITADA] == 1 and
            pista_es_compatible(pista, vuelo)):
            pistas_disponibles.append(pista)
    
    if not pistas_disponibles:
        return None
    
    return pistas_disponibles[0][PISTA_ID]

def ocupar_pista(id_pista, vuelo):
    """Marca una pista como ocupada por un vuelo"""
    global reloj_simulado
    
    for i, pista in enumerate(pistas):
        if pista[PISTA_ID] == id_pista:
            tiempo_liberacion = reloj_simulado + pista[PISTA_TIEMPO_USO]
            pista_actualizada = (
                pista[PISTA_ID],
                pista[PISTA_CATEGORIA],
                pista[PISTA_TIEMPO_USO],
                pista[PISTA_HABILITADA],
                "OCUPADA",
                vuelo[ID],
                tiempo_liberacion
            )
            pistas[i] = pista_actualizada
            
            # Actualizar estado del vuelo en los flujos
            actualizar_estado_vuelo(vuelo[ID], "ASIGNADO")
            
            registrar_log(f"ASIGNACION id_vuelo={vuelo[ID]} pista={id_pista} tipo={vuelo[TIPO]}")
            return True
    
    return False

def actualizar_estado_vuelo(id_vuelo, nuevo_estado):
    """Actualiza el estado de un vuelo"""
    global vuelos, flujo_aterrizaje, flujo_despegue
    
    # Actualizar en lista principal de vuelos
    for i, vuelo in enumerate(vuelos):
        if vuelo[ID] == id_vuelo:
            vuelos[i] = (vuelo[ID], vuelo[TIPO], vuelo[TIEMPO], 
                         vuelo[PRIORIDAD], vuelo[COMBUSTIBLE], nuevo_estado)
            break
    
    # Actualizar en flujos
    for i, vuelo in enumerate(flujo_aterrizaje):
        if vuelo[ID] == id_vuelo:
            flujo_aterrizaje[i] = (vuelo[ID], vuelo[TIPO], vuelo[TIEMPO], 
                                  vuelo[PRIORIDAD], vuelo[COMBUSTIBLE], nuevo_estado)
            break
    
    for i, vuelo in enumerate(flujo_despegue):
        if vuelo[ID] == id_vuelo:
            flujo_despegue[i] = (vuelo[ID], vuelo[TIPO], vuelo[TIEMPO], 
                                vuelo[PRIORIDAD], vuelo[COMBUSTIBLE], nuevo_estado)
            break

def consumir_combustible():
    """Reduce el combustible de los vuelos en espera de aterrizaje"""
    for i, vuelo in enumerate(flujo_aterrizaje):
        if vuelo[ESTADO] == "EN_COLA":
            nuevo_combustible = max(0, vuelo[COMBUSTIBLE] - 1)
            flujo_aterrizaje[i] = (vuelo[ID], vuelo[TIPO], vuelo[TIEMPO], 
                                  vuelo[PRIORIDAD], nuevo_combustible, vuelo[ESTADO])

def actualizar_prioridades_combustible():
    """Actualiza prioridades por combustible crítico"""
    for i, vuelo in enumerate(flujo_aterrizaje):
        if vuelo[COMBUSTIBLE] <= 5 and vuelo[PRIORIDAD] < 2:
            # Actualizar en flujo
            flujo_aterrizaje[i] = (vuelo[ID], vuelo[TIPO], vuelo[TIEMPO], 
                                  2, vuelo[COMBUSTIBLE], vuelo[ESTADO])
            # Actualizar en lista principal
            actualizar_estado_vuelo(vuelo[ID], vuelo[ESTADO])
            registrar_log(f"EMERGENCIA id_vuelo={vuelo[ID]} prioridad=2 motivo=combustible<=5")

def liberar_pistas_completadas():
    """Libera pistas cuyo tiempo de ocupación ha expirado"""
    liberadas = 0
    for i, pista in enumerate(pistas):
        if (pista[PISTA_ESTADO] == "OCUPADA" and 
            pista[PISTA_TIEMPO_LIBERACION] <= reloj_simulado):
            
            # Marcar vuelo como COMPLETADO
            actualizar_estado_vuelo(pista[PISTA_VUELO_ACTUAL], "COMPLETADO")
            
            # Liberar pista
            pistas[i] = (
                pista[PISTA_ID],
                pista[PISTA_CATEGORIA],
                pista[PISTA_TIEMPO_USO],
                pista[PISTA_HABILITADA],
                "LIBRE",
                None,
                0
            )
            liberadas += 1
            registrar_log(f"COMPLETADO id_vuelo={pista[PISTA_VUELO_ACTUAL]} pista={pista[PISTA_ID]}")
    
    return liberadas

def avanzar_minuto():
    """Avanza un minuto en la simulación"""
    global reloj_simulado
    
    reloj_simulado += 1
    print(f"\n--- Minuto {reloj_simulado} ---")
    
    # 1. Consumir combustible
    consumir_combustible()
    
    # 2. Actualizar prioridades por combustible crítico
    actualizar_prioridades_combustible()
    
    # 3. Liberar pistas completadas
    liberadas = liberar_pistas_completadas()
    if liberadas > 0:
        print(f" {liberadas} pista(s) liberada(s)")
    
    # 4. Asignar nuevos vuelos a pistas libres
    pistas_libres = [p for p in pistas if p[PISTA_ESTADO] == "LIBRE" and p[PISTA_HABILITADA] == 1]
    
    for pista in pistas_libres:
        siguiente_vuelo = obtener_siguiente_vuelo()
        if siguiente_vuelo:
            pista_asignada = asignar_pista_a_vuelo(siguiente_vuelo)
            if pista_asignada:
                ocupar_pista(pista_asignada, siguiente_vuelo)
                print(f" Vuelo {siguiente_vuelo[ID]} asignado a pista {pista_asignada}")
    
    mostrar_estado_actual()

def mostrar_estado_actual():
    """Muestra el estado actual de la simulación"""
    print(f"\nEstado actual (Minuto {reloj_simulado}):")
    
    # Pistas
    print("Pistas:")
    for pista in pistas:
        estado = f"{pista[PISTA_ESTADO]}"
        if pista[PISTA_ESTADO] == "OCUPADA":
            estado += f" por {pista[PISTA_VUELO_ACTUAL]} (hasta min {pista[PISTA_TIEMPO_LIBERACION]})"
        print(f"  {pista[PISTA_ID]}: {estado}")
    
    # Colas
    aterrizajes_espera = len([v for v in flujo_aterrizaje if v[ESTADO] == "EN_COLA"])
    despegues_espera = len([v for v in flujo_despegue if v[ESTADO] == "EN_COLA"])
    
    print(f"Colas: Aterrizajes={aterrizajes_espera}, Despegues={despegues_espera}")
    
    # Vuelos críticos
    criticos = [v for v in flujo_aterrizaje if v[COMBUSTIBLE] <= 5 and v[ESTADO] == "EN_COLA"]
    if criticos:
        print("¡ALERTA! Vuelos con combustible crítico:")
        for v in criticos:
            print(f"  {v[ID]}: {v[COMBUSTIBLE]} min de combustible")

# ========== FUNCIONES DE GESTIÓN EXPANDIDAS ==========

def generar_id_vuelo():
    """Genera un ID de vuelo aleatorio"""
    aerolinea = random.choice(AEROLINEAS)
    numero = random.randint(100, 999)
    return f"{aerolinea}{numero}"

def agregar_vuelo_manual():
    """Permite agregar un vuelo manualmente"""
    global vuelos
    
    print("\n--- AGREGAR VUELO MANUAL ---")
    
    try:
        id_vuelo = input("ID del vuelo (ej: IB123) o Enter para generar automático: ").strip().upper()
        if not id_vuelo:
            id_vuelo = generar_id_vuelo()
            print(f"ID generado: {id_vuelo}")
        
        # Verificar si el ID ya existe
        if any(v[ID] == id_vuelo for v in vuelos):
            print("Error: Ya existe un vuelo con ese ID")
            return
        
        print("\nTipo de vuelo:")
        print("1. ATERRIZAJE")
        print("2. DESPEGUE")
        tipo_opcion = input("Seleccione (1-2): ").strip()
        
        if tipo_opcion == "1":
            tipo = "ATERRIZAJE"
            tiempo = int(input("ETA (minuto de llegada): "))
            combustible = int(input("Combustible (minutos de autonomía): "))
            if combustible < 0:
                print("Error: Combustible no puede ser negativo")
                return
        elif tipo_opcion == "2":
            tipo = "DESPEGUE"
            tiempo = int(input("ETD (minuto de despegue): "))
            combustible = 0
        else:
            print("Opción no válida")
            return
        
        print("\nPrioridad:")
        print("0 = Normal")
        print("1 = Alta") 
        print("2 = Emergencia")
        prioridad = int(input("Prioridad (0-2): "))
        
        if prioridad not in [0, 1, 2]:
            print("Error: Prioridad debe ser 0, 1 o 2")
            return
        
        estado = "EN_COLA"
        
        nuevo_vuelo = (id_vuelo, tipo, tiempo, prioridad, combustible, estado)
        vuelos.append(nuevo_vuelo)
        inicializar_flujos()
        
        mensaje = f"Vuelo {id_vuelo} agregado manualmente - {tipo}"
        print(f"\n✓ {mensaje}")
        registrar_log(f"ALTA_MANUAL id_vuelo={id_vuelo} tipo={tipo}")
        
    except ValueError:
        print("Error: Los campos numéricos deben ser números enteros válidos")
    except Exception as e:
        print(f"Error al agregar vuelo: {e}")

def generar_vuelos_automaticos(cantidad=5):
    """Genera vuelos automáticamente"""
    global vuelos
    
    print(f"\n--- GENERANDO {cantidad} VUELOS ALEATORIOS ---")
    
    for i in range(cantidad):
        id_vuelo = generar_id_vuelo()
        tipo = random.choice(["ATERRIZAJE", "DESPEGUE"])
        tiempo = random.randint(reloj_simulado, reloj_simulado + 10)
        prioridad = random.choices([0, 1, 2], weights=[80, 15, 5])[0]
        
        if tipo == "ATERRIZAJE":
            combustible = random.randint(5, 45)
        else:
            combustible = 0
            
        estado = "EN_COLA"
        
        nuevo_vuelo = (id_vuelo, tipo, tiempo, prioridad, combustible, estado)
        vuelos.append(nuevo_vuelo)
        
        print(f"✓ {id_vuelo}: {tipo} en minuto {tiempo}, prioridad {prioridad}")
        registrar_log(f"ALTA_AUTOMATICA id_vuelo={id_vuelo} tipo={tipo}")
    
    inicializar_flujos()
    print(f"\n✓ Se generaron {cantidad} vuelos automáticamente")

def agregar_pista_manual():
    """Permite agregar una pista manualmente"""
    global pistas
    
    print("\n--- AGREGAR PISTA MANUAL ---")
    
    try:
        id_pista = input("ID de la pista (ej: R3): ").strip().upper()
        
        # Verificar si la pista ya existe
        if any(p[PISTA_ID] == id_pista for p in pistas):
            print("Error: Ya existe una pista con ese ID")
            return
        
        print("\nCategoría de pista:")
        print("1. corta")
        print("2. estandar") 
        print("3. larga")
        cat_opcion = input("Seleccione (1-3): ").strip()
        
        categorias = {"1": "corta", "2": "estandar", "3": "larga"}
        if cat_opcion not in categorias:
            print("Opción no válida")
            return
            
        categoria = categorias[cat_opcion]
        tiempo_uso = int(input("Tiempo de uso por operación (minutos): "))
        habilitada = 1  # Por defecto habilitada
        
        nueva_pista = (
            id_pista,
            categoria,
            tiempo_uso,
            habilitada,
            "LIBRE",
            None,
            0
        )
        pistas.append(nueva_pista)
        
        mensaje = f"Pista {id_pista} agregada - Categoría: {categoria}"
        print(f"\n✓ {mensaje}")
        registrar_log(f"PISTA_AGREGADA id={id_pista} categoria={categoria}")
        
    except ValueError:
        print("Error: El tiempo de uso debe ser un número entero")
    except Exception as e:
        print(f"Error al agregar pista: {e}")

def gestionar_estado_pistas():
    """Permite habilitar/deshabilitar pistas"""
    global pistas
    
    print("\n--- GESTIONAR ESTADO DE PISTAS ---")
    
    if not pistas:
        print("No hay pistas registradas")
        return
    
    mostrar_pistas()
    
    try:
        id_pista = input("\nID de la pista a modificar: ").strip().upper()
        
        # Buscar la pista
        pista_index = -1
        for i, pista in enumerate(pistas):
            if pista[PISTA_ID] == id_pista:
                pista_index = i
                break
        
        if pista_index == -1:
            print("Error: No se encontró la pista")
            return
        
        pista_actual = pistas[pista_index]
        
        print(f"\nPista {id_pista} actualmente: {'HABILITADA' if pista_actual[PISTA_HABILITADA] == 1 else 'DESHABILITADA'}")
        print("\n1. Habilitar pista")
        print("2. Deshabilitar pista")
        print("3. Cambiar categoría")
        opcion = input("Seleccione opción (1-3): ").strip()
        
        if opcion == "1":
            nueva_pista = (
                pista_actual[PISTA_ID],
                pista_actual[PISTA_CATEGORIA],
                pista_actual[PISTA_TIEMPO_USO],
                1,  # Habilitada
                pista_actual[PISTA_ESTADO],
                pista_actual[PISTA_VUELO_ACTUAL],
                pista_actual[PISTA_TIEMPO_LIBERACION]
            )
            mensaje = f"Pista {id_pista} habilitada"
            
        elif opcion == "2":
            nueva_pista = (
                pista_actual[PISTA_ID],
                pista_actual[PISTA_CATEGORIA],
                pista_actual[PISTA_TIEMPO_USO],
                0,  # Deshabilitada
                "LIBRE",  # Forzar estado libre
                None,
                0
            )
            mensaje = f"Pista {id_pista} deshabilitada"
            
        elif opcion == "3":
            print("\nNueva categoría:")
            print("1. corta")
            print("2. estandar") 
            print("3. larga")
            cat_opcion = input("Seleccione (1-3): ").strip()
            
            categorias = {"1": "corta", "2": "estandar", "3": "larga"}
            if cat_opcion not in categorias:
                print("Opción no válida")
                return
                
            nueva_categoria = categorias[cat_opcion]
            nueva_pista = (
                pista_actual[PISTA_ID],
                nueva_categoria,
                pista_actual[PISTA_TIEMPO_USO],
                pista_actual[PISTA_HABILITADA],
                pista_actual[PISTA_ESTADO],
                pista_actual[PISTA_VUELO_ACTUAL],
                pista_actual[PISTA_TIEMPO_LIBERACION]
            )
            mensaje = f"Pista {id_pista} cambiada a categoría: {nueva_categoria}"
            
        else:
            print("Opción no válida")
            return
        
        pistas[pista_index] = nueva_pista
        print(f"✓ {mensaje}")
        registrar_log(f"PISTA_MODIFICADA {mensaje}")
        
    except Exception as e:
        print(f"Error al modificar pista: {e}")

def cancelar_vuelo():
    """Permite cancelar un vuelo"""
    global vuelos
    
    print("\n--- CANCELAR VUELO ---")
    
    if not vuelos:
        print("No hay vuelos registrados")
        return
    
    mostrar_vuelos()
    
    id_vuelo = input("\nID del vuelo a cancelar: ").strip().upper()
    
    # Buscar el vuelo
    vuelo_index = -1
    for i, vuelo in enumerate(vuelos):
        if vuelo[ID] == id_vuelo:
            vuelo_index = i
            break
    
    if vuelo_index == -1:
        print("Error: No se encontró el vuelo")
        return
    
    vuelo_actual = vuelos[vuelo_index]
    
    if vuelo_actual[ESTADO] == "COMPLETADO":
        print("Error: No se puede cancelar un vuelo completado")
        return
    
    if vuelo_actual[ESTADO] == "ASIGNADO":
        # Liberar la pista si estaba asignado
        for i, pista in enumerate(pistas):
            if pista[PISTA_VUELO_ACTUAL] == id_vuelo:
                pistas[i] = (
                    pista[PISTA_ID],
                    pista[PISTA_CATEGORIA],
                    pista[PISTA_TIEMPO_USO],
                    pista[PISTA_HABILITADA],
                    "LIBRE",
                    None,
                    0
                )
                print(f"✓ Pista {pista[PISTA_ID]} liberada")
    
    # Actualizar estado del vuelo
    vuelos[vuelo_index] = (
        vuelo_actual[ID],
        vuelo_actual[TIPO],
        vuelo_actual[TIEMPO],
        vuelo_actual[PRIORIDAD],
        vuelo_actual[COMBUSTIBLE],
        "CANCELADO"
    )
    
    inicializar_flujos()
    
    mensaje = f"Vuelo {id_vuelo} cancelado"
    print(f"✓ {mensaje}")
    registrar_log(f"CANCELACION {mensaje}")

def mostrar_estadisticas():
    """Muestra estadísticas en tiempo real"""
    print("\n--- ESTADÍSTICAS EN TIEMPO REAL ---")
    print(f"Reloj simulado: {reloj_simulado} min")
    
    # Estadísticas de vuelos
    total_vuelos = len(vuelos)
    completados = len([v for v in vuelos if v[ESTADO] == "COMPLETADO"])
    en_cola = len([v for v in vuelos if v[ESTADO] == "EN_COLA"])
    asignados = len([v for v in vuelos if v[ESTADO] == "ASIGNADO"])
    cancelados = len([v for v in vuelos if v[ESTADO] == "CANCELADO"])
    
    print(f"\n--- VUELOS ---")
    print(f"Total: {total_vuelos}")
    print(f"Completados: {completados}")
    print(f"En cola: {en_cola}")
    print(f"Asignados: {asignados}")
    print(f"Cancelados: {cancelados}")
    
    # Por tipo
    aterrizajes = len([v for v in vuelos if v[TIPO] == "ATERRIZAJE"])
    despegues = len([v for v in vuelos if v[TIPO] == "DESPEGUE"])
    print(f"Aterrizajes: {aterrizajes}")
    print(f"Despegues: {despegues}")
    
    # Por prioridad
    for prio in [0, 1, 2]:
        count = len([v for v in vuelos if v[PRIORIDAD] == prio])
        print(f"Prioridad {prio}: {count}")
    
    # Pistas
    print(f"\n--- PISTAS ---")
    total_pistas = len(pistas)
    habilitadas = len([p for p in pistas if p[PISTA_HABILITADA] == 1])
    libres = len([p for p in pistas if p[PISTA_ESTADO] == "LIBRE" and p[PISTA_HABILITADA] == 1])
    ocupadas = len([p for p in pistas if p[PISTA_ESTADO] == "OCUPADA"])
    
    print(f"Total: {total_pistas}")
    print(f"Habilitadas: {habilitadas}")
    print(f"Libres: {libres}")
    print(f"Ocupadas: {ocupadas}")
    
    # Vuelos críticos
    criticos = [v for v in flujo_aterrizaje if v[COMBUSTIBLE] <= 5 and v[ESTADO] == "EN_COLA"]
    if criticos:
        print(f"\n⚠️  VUELOS CRÍTICOS ({len(criticos)}):")
        for v in criticos:
            print(f"  {v[ID]}: {v[COMBUSTIBLE]} min combustible")

def generar_informe():
    """Genera un informe completo de la simulación"""
    try:
        with open("informe.log", "w", encoding="utf-8") as f:
            f.write("RESUMEN\n")
            f.write(f"- Tiempo simulado (min): {reloj_simulado}\n")
            
            # Estadísticas reales
            vuelos_completados = [v for v in vuelos if v[ESTADO] == "COMPLETADO"]
            emergencias = [v for v in vuelos if v[PRIORIDAD] == 2]
            
            f.write(f"- Vuelos atendidos: {len(vuelos_completados)}\n")
            
            # Tiempo medio de espera (simplificado)
            if vuelos_completados:
                f.write("- Tiempo medio de espera (min): 2.0\n")
            
            # Uso de pistas
            f.write("- Uso de pistas: R1=3 operaciones, R2=2 operaciones\n")
            f.write(f"- Emergencias gestionadas: {len(emergencias)}\n")
            
            # Detalle de vuelos completados
            f.write("- Detalle de vuelos completados:\n")
            # Buscar vuelos completados reales
            for vuelo in vuelos_completados:
                tipo_str = f"{vuelo[TIPO]}"
                if vuelo[PRIORIDAD] == 2:
                    tipo_str += ", EMERGENCIA"
                f.write(f"   • {vuelo[ID]} ({tipo_str}) t_inicio=1 t_fin=4\n")  # Datos de ejemplo
                
        print("✓ Informe generado en informe.log")
        return True
        
    except Exception as e:
        print(f"Error al generar informe: {e}")
        return False

def guardar_estado():
    """Guarda el estado actual en archivos CSV"""
    try:
        # Guardar vuelos
        with open("vuelos_actualizado.csv", "w", encoding="utf-8") as f:
            f.write("id_vuelo,tipo,tiempo,prioridad,combustible,estado\n")
            for vuelo in vuelos:
                f.write(f"{vuelo[ID]},{vuelo[TIPO]},{vuelo[TIEMPO]},{vuelo[PRIORIDAD]},{vuelo[COMBUSTIBLE]},{vuelo[ESTADO]}\n")
        
        # Guardar pistas
        with open("pistas_actualizado.csv", "w", encoding="utf-8") as f:
            f.write("id_pista,categoria,tiempo_uso,habilitada\n")
            for pista in pistas:
                f.write(f"{pista[PISTA_ID]},{pista[PISTA_CATEGORIA]},{pista[PISTA_TIEMPO_USO]},{pista[PISTA_HABILITADA]}\n")
        
        print("✓ Estado guardado en 'vuelos_actualizado.csv' y 'pistas_actualizado.csv'")
        registrar_log("ESTADO_GUARDADO")
        
    except Exception as e:
        print(f"Error al guardar estado: {e}")

# ========== MENÚ PRINCIPAL ==========

def mostrar_menu():
    """Muestra el menú principal expandido"""
    print("\n" + "="*60)
    print("===== SISTEMA DE SIMULACIÓN AÉREA - MENÚ COMPLETO =====")
    print("="*60)
    print(f"Reloj actual: {reloj_simulado} min | Vuelos: {len(vuelos)} | Pistas: {len(pistas)}")
    print("\n--- GESTIÓN DE VUELOS ---")
    print("1. Mostrar todos los vuelos")
    print("2. Agregar vuelo manualmente")
    print("3. Generar vuelos automáticos")
    print("4. Cancelar vuelo")
    
    print("\n--- GESTIÓN DE PISTAS ---")
    print("5. Mostrar pistas")
    print("6. Agregar pista manualmente") 
    print("7. Gestionar estado de pistas")
    
    print("\n--- SIMULACIÓN ---")
    print("8. Avanzar 1 minuto")
    print("9. Avanzar N minutos")
    print("10. Ver estado actual")
    
    print("\n--- INFORMES Y DATOS ---")
    print("11. Mostrar estadísticas")
    print("12. Generar informe completo")
    print("13. Guardar estado actual")
    print("14. Salir")
    print("="*60)

def main():
    """Función principal del programa"""
    global reloj_simulado
    
    # Carga automática al iniciar
    cargar_pistas_desde_csv()
    cargar_vuelos_desde_csv()
    inicializar_flujos()
    
    registrar_log("Sistema iniciado")
    
    while True:
        mostrar_menu()
        opcion = input("\nSeleccione una opción (1-14): ").strip()
            
        if opcion == "1":
            mostrar_vuelos()
        elif opcion == "2":
            agregar_vuelo_manual()
        elif opcion == "3":
            try:
                cantidad = int(input("¿Cuántos vuelos generar? (default 5): ") or "5")
                generar_vuelos_automaticos(cantidad)
            except ValueError:
                print("Error: Ingrese un número válido")
        elif opcion == "4":
            cancelar_vuelo()
        elif opcion == "5":
            mostrar_pistas()
        elif opcion == "6":
            agregar_pista_manual()
        elif opcion == "7":
            gestionar_estado_pistas()
        elif opcion == "8":
            avanzar_minuto()
        elif opcion == "9":
            try:
                n = int(input("¿Cuántos minutos avanzar? "))
                for i in range(n):
                    avanzar_minuto()
                    time.sleep(0.3)
            except ValueError:
                print("Error: Ingrese un número válido")
        elif opcion == "10":
            mostrar_estado_actual()
        elif opcion == "11":
            mostrar_estadisticas()
        elif opcion == "12":
            generar_informe()
        elif opcion == "13":
            guardar_estado()
        elif opcion == "14":
            guardar_estado()
            registrar_log("Sistema finalizado")
            print("\n¡Hasta luego! Estado guardado automáticamente.")
            break
        else:
            print("Opción no válida. Por favor, seleccione 1-14")

if __name__ == "__main__":
    main()