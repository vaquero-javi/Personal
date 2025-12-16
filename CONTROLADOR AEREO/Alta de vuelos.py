
import os

# Constantes para índices de la tupla de vuelo
ID = 0
TIPO = 1
TIEMPO = 2
PRIORIDAD = 3
COMBUSTIBLE = 4
ESTADO = 5

# Estados posibles
ESTADOS = ["EN_COLA", "ASIGNADO", "COMPLETADO", "CANCELADO"]

def registrar_log(mensaje, archivo="eventos.log"):
    """Registra un evento en el archivo de log"""
    try:
        with open(archivo, "a", encoding="utf-8") as f:
            f.write(f"{mensaje}\n")
    except Exception as e:
        print(f"Error al escribir en log: {e}")

def generar_informe(vuelos, archivo="informe.log"):
    """Genera un informe detallado de los vuelos"""
    try:
        with open(archivo, "w", encoding="utf-8") as f:
            f.write("=== INFORME DE VUELOS ===\n")
            f.write(f"Total de vuelos: {len(vuelos)}\n\n")
            
            # Contadores por tipo y estado
            aterrizajes = [v for v in vuelos if v[TIPO] == "ATERRIZAJE"]
            despegues = [v for v in vuelos if v[TIPO] == "DESPEGUE"]
            
            f.write(f"Vuelos de aterrizaje: {len(aterrizajes)}\n")
            f.write(f"Vuelos de despegue: {len(despegues)}\n\n")
            
            # Por estado
            for estado in ESTADOS:
                count = len([v for v in vuelos if v[ESTADO] == estado])
                f.write(f"Vuelos en estado {estado}: {count}\n")
            
            f.write("\n--- Vuelos por prioridad ---\n")
            for prioridad in [0, 1, 2]:
                count = len([v for v in vuelos if v[PRIORIDAD] == prioridad])
                f.write(f"Prioridad {prioridad}: {count} vuelos\n")
            
            f.write("\n--- Vuelos de aterrizaje con combustible crítico (<15 min) ---\n")
            criticos = [v for v in aterrizajes if v[COMBUSTIBLE] < 15 and v[ESTADO] != "COMPLETADO"]
            for vuelo in criticos:
                f.write(f"{vuelo[ID]}: {vuelo[COMBUSTIBLE]} minutos restantes\n")
            
            if not criticos:
                f.write("No hay vuelos con combustible crítico\n")
                
        registrar_log(f"Informe generado en {archivo}")
        return True
        
    except Exception as e:
        mensaje = f"Error al generar informe: {e}"
        print(mensaje)
        registrar_log(mensaje)
        return False

def cargar_vuelos_desde_csv(archivo="vuelos.csv"):
    """Carga los vuelos desde un archivo CSV"""
    vuelos = []
    try:
        with open(archivo, "r", encoding="utf-8") as f:
            lineas = f.readlines()
            
        for numero_linea, linea in enumerate(lineas[1:], start=2):  # Saltar encabezado
            try:
                datos = linea.strip().split(",")
                if len(datos) < 6:
                    continue
                
                id_vuelo = datos[0].strip()
                tipo = datos[1].strip().upper()
                tiempo = int(datos[2].strip())
                prioridad = int(datos[3].strip())
                combustible = int(datos[4].strip()) if tipo == "ATERRIZAJE" else 0
                estado = datos[5].strip().upper()
                
                # Validaciones
                if tipo not in ["ATERRIZAJE", "DESPEGUE"]:
                    raise ValueError(f"Tipo de vuelo inválido: {tipo}")
                if estado not in ESTADOS:
                    raise ValueError(f"Estado inválido: {estado}")
                if prioridad not in [0, 1, 2]:
                    raise ValueError(f"Prioridad inválida: {prioridad}")
                if tipo == "ATERRIZAJE" and combustible < 0:
                    raise ValueError(f"Combustible inválido: {combustible}")
                
                vuelo = (id_vuelo, tipo, tiempo, prioridad, combustible, estado)
                vuelos.append(vuelo)
                
            except (ValueError, IndexError) as e:
                mensaje_error = f"Error en línea {numero_linea}: {e}"
                print(mensaje_error)
                registrar_log(mensaje_error)
                
        registrar_log(f"Cargados {len(vuelos)} vuelos desde {archivo}")
        
    except FileNotFoundError:
        mensaje = f"Archivo {archivo} no encontrado. Iniciando con lista vacía."
        print(mensaje)
        registrar_log(mensaje)
    except Exception as e:
        mensaje = f"Error al cargar vuelos: {e}"
        print(mensaje)
        registrar_log(mensaje)
    
    return vuelos

def cargar_pistas_desde_csv(archivo="pistas.csv"):
    """Carga información de pistas desde archivo CSV"""
    pistas = []
    try:
        with open(archivo, "r", encoding="utf-8") as f:
            lineas = f.readlines()
            
        for numero_linea, linea in enumerate(lineas[1:], start=2):
            try:
                datos = linea.strip().split(",")
                if len(datos) >= 2:
                    id_pista = datos[0].strip()
                    estado = datos[1].strip().upper()
                    pistas.append((id_pista, estado))
                    
            except Exception as e:
                mensaje_error = f"Error en pista línea {numero_linea}: {e}"
                print(mensaje_error)
                registrar_log(mensaje_error)
                
        registrar_log(f"Cargadas {len(pistas)} pistas desde {archivo}")
        
    except FileNotFoundError:
        mensaje = f"Archivo {archivo} no encontrado."
        print(mensaje)
        registrar_log(mensaje)
    
    return pistas

def guardar_estado_vuelos(vuelos, archivo="vuelos.csv"):
    """Guarda el estado actual de los vuelos en el archivo CSV"""
    try:
        with open(archivo, "w", encoding="utf-8") as f:
            f.write("id,tipo,tiempo,prioridad,combustible,estado\n")
            for vuelo in vuelos:
                linea = f"{vuelo[ID]},{vuelo[TIPO]},{vuelo[TIEMPO]},{vuelo[PRIORIDAD]},{vuelo[COMBUSTIBLE]},{vuelo[ESTADO]}\n"
                f.write(linea)
        registrar_log(f"Estado guardado en {archivo} con {len(vuelos)} vuelos")
    except Exception as e:
        mensaje = f"Error al guardar estado: {e}"
        print(mensaje)
        registrar_log(mensaje)

def mostrar_vuelos(vuelos):
    """Muestra todos los vuelos en formato tabular"""
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

def mostrar_pistas(pistas):
    """Muestra el estado de las pistas"""
    if not pistas:
        print("No hay pistas registradas")
        return
    
    print("\n" + "="*40)
    print(f"{'PISTA':<10} {'ESTADO':<10}")
    print("-"*40)
    
    for pista in pistas:
        print(f"{pista[0]:<10} {pista[1]:<10}")
    
    print("="*40)

def buscar_vuelo_por_id(vuelos, id_vuelo):
    """Busca un vuelo por su ID"""
    for i, vuelo in enumerate(vuelos):
        if vuelo[ID] == id_vuelo:
            return i, vuelo
    return -1, None

def actualizar_estado_vuelo(vuelos, id_vuelo, nuevo_estado):
    """Actualiza el estado de un vuelo"""
    indice, vuelo = buscar_vuelo_por_id(vuelos, id_vuelo)
    
    if indice == -1:
        mensaje = f"Vuelo {id_vuelo} no encontrado"
        print(mensaje)
        registrar_log(mensaje)
        return False
    
    if nuevo_estado not in ESTADOS:
        mensaje = f"Estado {nuevo_estado} no válido. Estados permitidos: {ESTADOS}"
        print(mensaje)
        registrar_log(mensaje)
        return False
    
    # Crear nuevo vuelo con estado actualizado (las tuplas son inmutables)
    vuelo_actualizado = (
        vuelo[ID],
        vuelo[TIPO],
        vuelo[TIEMPO],
        vuelo[PRIORIDAD],
        vuelo[COMBUSTIBLE],
        nuevo_estado
    )
    
    vuelos[indice] = vuelo_actualizado
    mensaje = f"Vuelo {id_vuelo} actualizado a estado: {nuevo_estado}"
    print(mensaje)
    registrar_log(mensaje)
    return True

def agregar_vuelo_manual(vuelos):
    """Permite agregar un vuelo manualmente"""
    try:
        print("\n--- Alta manual de vuelo ---")
        id_vuelo = input("ID del vuelo (ej: IB123): ").strip().upper()
        
        # Verificar si el vuelo ya existe
        if buscar_vuelo_por_id(vuelos, id_vuelo)[0] != -1:
            print("Error: Ya existe un vuelo con ese ID")
            return
        
        tipo = input("Tipo (ATERRIZAJE/DESPEGUE): ").strip().upper()
        if tipo not in ["ATERRIZAJE", "DESPEGUE"]:
            print("Error: Tipo debe ser ATERRIZAJE o DESPEGUE")
            return
        
        tiempo = int(input("ETA/ETD (minuto): "))
        prioridad = int(input("Prioridad (0=normal, 1=alta, 2=emergencia): "))
        if prioridad not in [0, 1, 2]:
            print("Error: Prioridad debe ser 0, 1 o 2")
            return
        
        if tipo == "ATERRIZAJE":
            combustible = int(input("Combustible (minutos de autonomía): "))
            if combustible < 0:
                print("Error: Combustible no puede ser negativo")
                return
        else:
            combustible = 0
        
        estado = "EN_COLA"  # Estado por defecto
        
        nuevo_vuelo = (id_vuelo, tipo, tiempo, prioridad, combustible, estado)
        vuelos.append(nuevo_vuelo)
        
        mensaje = f"Vuelo {id_vuelo} agregado exitosamente"
        print(mensaje)
        registrar_log(mensaje)
        
    except ValueError:
        print("Error: Los campos numéricos deben ser números enteros válidos")
    except Exception as e:
        print(f"Error al agregar vuelo: {e}")

def mostrar_menu():
    """Muestra el menú principal"""
    print("\n" *3)
    print("=" * 40)
    print("\n===== SISTEMA DE GESTIÓN DE VUELOS =====\n")
    print("=" * 40)
    print("1. Mostrar todos los vuelos")
    print("2. Mostrar pistas")
    print("3. Agregar vuelo manualmente")
    print("4. Actualizar estado de vuelo")
    print("5. Guardar estado actual")
    print("6. Generar informe")
    print("7. Cargar vuelos desde archivo")
    print("8. Salir")
    print("=" * 40)

def main():
    """Función principal del programa"""
    # Carga automática al iniciar
    vuelos = cargar_vuelos_desde_csv("vuelos.csv")
    pistas = cargar_pistas_desde_csv("pistas.csv")
    registrar_log("Sistema iniciado")
    
    while True:
        mostrar_menu()
        opcion = input("Seleccione una opción: ").strip()
            
        if opcion == "1":
            mostrar_vuelos(vuelos)
                
        elif opcion == "2":
            mostrar_pistas(pistas)
                
        elif opcion == "3":
            agregar_vuelo_manual(vuelos)
                
        elif opcion == "4":
            if vuelos:
                id_vuelo = input("ID del vuelo a actualizar: ").strip().upper()
                print("Estados disponibles:", ", ".join(ESTADOS))
                nuevo_estado = input("Nuevo estado: ").strip().upper()
                actualizar_estado_vuelo(vuelos, id_vuelo, nuevo_estado)
            else:
                print("No hay vuelos para actualizar")
                    
        elif opcion == "5":
            guardar_estado_vuelos(vuelos, "vuelos.csv")
            print("Estado guardado exitosamente")
                
        elif opcion == "6":
            if generar_informe(vuelos, "informe.log"):
                print("Informe generado exitosamente")
            else:
                print("Error al generar informe")
                    
        elif opcion == "7":
            archivo = input("Nombre del archivo CSV (Enter para vuelos.csv): ").strip()
            if not archivo:
                archivo = "vuelos.csv"
            vuelos = cargar_vuelos_desde_csv(archivo)
                
        elif opcion == "8":
            guardar_estado_vuelos(vuelos, "vuelos.csv")
            generar_informe(vuelos, "informe.log")
            registrar_log("Sistema finalizado")
            print("¡Hasta luego!")
            break
                
        else:
            print("Opción no válida. Por favor, seleccione 1-8")

if __name__ == "__main__":
    main()