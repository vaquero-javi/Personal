# Importa la librería tkinter para crear la interfaz gráfica
import tkinter as tk
# Importa componentes específicos de tkinter
from tkinter import ttk, messagebox, filedialog
# Importa la librería para interactuar con el sistema operativo
import os
# Importa la librería para trabajar con archivos CSV
import csv
# Importa la librería para manejar fechas y horas
from datetime import datetime
# Importa la librería para ejecutar tareas en paralelo (hilos)
import threading
# Importa la librería para controlar tiempos y pausas
import time

# Define constantes numéricas para acceder a los elementos de la tupla de vuelos
# Estas constantes hacen el código más legible
ID = 0        # Índice 0: ID del vuelo
TIPO = 1      # Índice 1: Tipo (ATERRIZAJE/DESPEGUE)
TIEMPO = 2    # Índice 2: Tiempo ETA/ETD
PRIORIDAD = 3 # Índice 3: Prioridad (0,1,2)
COMBUSTIBLE = 4 # Índice 4: Minutos de combustible
ESTADO = 5    # Índice 5: Estado del vuelo

# Define constantes para acceder a los elementos de la tupla de pistas
PISTA_ID = 0          # Índice 0: ID de la pista (ej: R1)
PISTA_CATEGORIA = 1   # Índice 1: Categoría (corta/estandar/larga)
PISTA_TIEMPO_USO = 2  # Índice 2: Tiempo que usa la pista (minutos)
PISTA_HABILITADA = 3  # Índice 3: Si está habilitada (1) o no (0)
PISTA_ESTADO = 4      # Índice 4: Estado (LIBRE/OCUPADA/DESHABILITADA)
PISTA_VUELO_ACTUAL = 5 # Índice 5: ID del vuelo que está usando la pista
PISTA_TIEMPO_FIN = 6  # Índice 6: Minuto en que termina el uso

# Lista de estados posibles que puede tener un vuelo
ESTADOS = ["EN_COLA", "ASIGNANDO", "EN_PISTA", "COMPLETADO", "CANCELADO"]

# Define la clase principal que maneja toda la aplicación
class SistemaVuelosGUI:
    # Método constructor, se ejecuta al crear una instancia de la clase
    def __init__(self, root):
        # Guarda la ventana principal (root) como atributo de la clase
        self.root = root
        # Establece el título de la ventana principal
        self.root.title("Sistema de Gestión de Vuelos - Aeropuerto")
        # Define el tamaño de la ventana (ancho x alto)
        self.root.geometry("1200x700")
        # Configura el color de fondo de la ventana
        self.root.configure(bg='#f0f0f0')
        
        # Inicializa una lista vacía para almacenar los vuelos
        self.vuelos = []
        # Inicializa una lista vacía para almacenar las pistas
        self.pistas = []
        # Inicializa el reloj de simulación en 0 minutos
        self.reloj_simulado = 0
        # Bandera que indica si la simulación está activa o no
        self.simulacion_activa = False
        # Variable para almacenar el hilo de simulación
        self.hilo_simulacion = None
        # Diccionario para llevar registro del tiempo restante en pista de cada vuelo
        self.tiempo_en_pista = {}  # Diccionario para rastrear tiempo en pista
        
        # Llama al método para configurar los estilos visuales
        self.setup_styles()
        
        # Llama al método para crear todos los widgets (botones, textos, etc.)
        self.create_widgets()
        
        # Llama al método para cargar datos iniciales desde archivos CSV
        self.cargar_datos_iniciales()
    
    # Método para configurar los estilos visuales de la interfaz
    def setup_styles(self):
        """Configurar estilos para la interfaz"""
        # Crea un objeto Style para personalizar la apariencia
        self.style = ttk.Style()
        # Selecciona el tema 'clam' para los widgets ttk
        self.style.theme_use('clam')
        
        # Define un diccionario con colores personalizados para la aplicación
        self.colors = {
            'primary': '#2c3e50',    # Color principal (azul oscuro)
            'secondary': '#3498db',  # Color secundario (azul)
            'success': '#27ae60',    # Color para éxito (verde)
            'warning': '#f39c12',    # Color para advertencias (naranja)
            'danger': '#e74c3c',     # Color para peligro (rojo)
            'light': '#ecf0f1',      # Color claro (gris claro)
            'dark': '#34495e'        # Color oscuro (gris oscuro)
        }
    
    # Método para crear todos los elementos de la interfaz gráfica
    def create_widgets(self):
        """Crear todos los widgets de la interfaz"""
        # Crea un frame principal que contendrá todos los demás widgets
        main_frame = ttk.Frame(self.root, padding="10")
        # Posiciona el frame principal en la ventana
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configura cómo se expanden las columnas y filas al cambiar el tamaño de la ventana
        self.root.columnconfigure(0, weight=1)  # Columna 0 se expande
        self.root.rowconfigure(0, weight=1)     # Fila 0 se expande
        main_frame.columnconfigure(1, weight=1) # Columna 1 del frame se expande
        main_frame.rowconfigure(1, weight=1)    # Fila 1 del frame se expande
        
        # Crea y posiciona el título principal de la aplicación
        title_label = ttk.Label(
            main_frame, 
            text="✈️ SISTEMA DE GESTIÓN DE VUELOS - AEROPUERTO",
            font=('Helvetica', 18, 'bold'),  # Fuente y tamaño
            foreground=self.colors['primary']  # Color del texto
        )
        title_label.grid(row=0, column=0, columnspan=3, pady=(0, 20))
        
        # Crea un frame con borde para los botones de acciones
        button_frame = ttk.LabelFrame(main_frame, text="Acciones", padding="10")
        button_frame.grid(row=1, column=0, sticky=(tk.N, tk.S), padx=(0, 10))
        
        # Define una lista de tuplas con (texto_del_botón, función_a_ejecutar)
        buttons = [
            ("📋 Mostrar Vuelos", self.mostrar_vuelos),
            ("➕ Agregar Vuelo", self.agregar_vuelo_dialog),
            ("🔧 Gestionar Pistas", self.gestionar_pistas_dialog),
            ("🔄 Actualizar Estado", self.actualizar_estado_dialog),
            ("📊 Generar Informe", self.generar_informe),
            ("💾 Guardar Estado", self.guardar_estado),
            ("📂 Cargar Archivo", self.cargar_archivo_dialog),
            ("🛬 Mostrar Pistas", self.mostrar_pistas),
            ("📈 Estadísticas", self.mostrar_estadisticas),
            ("❌ Cancelar Vuelo", self.cancelar_vuelo_dialog),
            ("▶️ Iniciar Simulación", self.iniciar_simulacion),
            ("⏸️ Pausar Simulación", self.pausar_simulacion),
            ("⏹️ Detener Simulación", self.detener_simulacion),
            ("🗑️ Limpiar Datos", self.limpiar_datos),
            ("❓ Ayuda", self.mostrar_ayuda),
            ("🚪 Salir", self.salir)
        ]
        
        # Crea un botón por cada elemento de la lista
        for i, (text, command) in enumerate(buttons):
            # Crea un botón con el texto y función correspondiente
            btn = ttk.Button(button_frame, text=text, command=command, width=25)
            # Posiciona el botón en el frame
            btn.grid(row=i, column=0, pady=5, padx=5, sticky=(tk.W, tk.E))
        
        # Crea un frame para mostrar información del sistema
        info_frame = ttk.LabelFrame(main_frame, text="Información del Sistema", padding="10")
        info_frame.grid(row=1, column=1, sticky=(tk.N, tk.S, tk.W, tk.E), padx=10)
        # Configura expansión del frame de información
        info_frame.columnconfigure(0, weight=1)
        info_frame.rowconfigure(0, weight=1)
        
        # Crea un widget Text para mostrar información con scroll
        self.text_info = tk.Text(info_frame, wrap=tk.WORD, width=70, height=30)
        # Crea una barra de scroll vertical
        scrollbar = ttk.Scrollbar(info_frame, orient=tk.VERTICAL, command=self.text_info.yview)
        # Configura el widget Text para usar la barra de scroll
        self.text_info.configure(yscrollcommand=scrollbar.set)
        
        # Posiciona el widget Text y la barra de scroll
        self.text_info.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        scrollbar.grid(row=0, column=1, sticky=(tk.N, tk.S))
        
        # Crea un frame para la barra de estado en la parte inferior
        status_frame = ttk.Frame(main_frame)
        status_frame.grid(row=2, column=0, columnspan=2, pady=(10, 0), sticky=(tk.W, tk.E))
        
        # Crea la etiqueta de estado con texto inicial
        self.status_label = ttk.Label(
            status_frame, 
            text="Sistema listo | Vuelos: 0 | Pistas: 0 | Tiempo: 0 min",
            relief=tk.SUNKEN,  # Efecto de hundido
            anchor=tk.W,       # Alineación a la izquierda
            padding=5          # Espaciado interno
        )
        # Empaca la etiqueta para que ocupe todo el ancho
        self.status_label.pack(fill=tk.X)
        
        # Crea un frame para los controles de simulación
        sim_frame = ttk.LabelFrame(main_frame, text="Control de Simulación", padding="5")
        sim_frame.grid(row=3, column=0, columnspan=2, pady=(10, 0), sticky=(tk.W, tk.E))
        
        # Crea etiqueta para la velocidad de simulación
        ttk.Label(sim_frame, text="Velocidad de simulación:").pack(side=tk.LEFT, padx=5)
        
        # Crea variable para almacenar la velocidad seleccionada
        self.velocidad_var = tk.StringVar(value="3")
        # Crea un combobox (lista desplegable) para seleccionar velocidad
        velocidad_combo = ttk.Combobox(sim_frame, textvariable=self.velocidad_var, 
                                      values=["1", "2", "3", "5", "10"], 
                                      state="readonly", width=5)
        velocidad_combo.pack(side=tk.LEFT, padx=5)
        
        # Crea etiqueta explicativa
        ttk.Label(sim_frame, text="segundos/minuto").pack(side=tk.LEFT, padx=5)
        
        # Configura etiquetas (tags) para formatear texto en el widget Text
        self.text_info.tag_configure('title', font=('Helvetica', 12, 'bold'), foreground=self.colors['primary'])
        self.text_info.tag_configure('header', font=('Helvetica', 10, 'bold'), foreground=self.colors['secondary'])
        self.text_info.tag_configure('success', foreground=self.colors['success'])
        self.text_info.tag_configure('warning', foreground=self.colors['warning'])
        self.text_info.tag_configure('danger', foreground=self.colors['danger'])
        self.text_info.tag_configure('info', foreground=self.colors['dark'])
        self.text_info.tag_configure('emergencia', font=('Helvetica', 10, 'bold'), foreground=self.colors['danger'])
        self.text_info.tag_configure('critico', font=('Helvetica', 10), foreground=self.colors['warning'])
        self.text_info.tag_configure('pista_libre', foreground=self.colors['success'])
        self.text_info.tag_configure('pista_ocupada', foreground=self.colors['warning'])
        self.text_info.tag_configure('pista_deshabilitada', foreground=self.colors['danger'])
    
    # Método para cargar datos iniciales al iniciar la aplicación
    def cargar_datos_iniciales(self):
        """Cargar datos iniciales desde archivos CSV"""
        try:
            # Intenta cargar vuelos desde el archivo vuelos.csv
            vuelos_cargados = self.cargar_vuelos_desde_csv("vuelos.csv")
            
            # Intenta cargar pistas desde el archivo pistas.csv
            pistas_cargadas = self.cargar_pistas_desde_csv("pistas.csv")
            
            # Actualiza la barra de estado
            self.actualizar_status()
            
            # Muestra mensaje de éxito en el área de texto
            self.text_info.insert(tk.END, f"✅ Sistema iniciado correctamente\n", 'success')
            self.text_info.insert(tk.END, f"📊 Vuelos cargados: {len(vuelos_cargados)}\n")
            self.text_info.insert(tk.END, f"🛬 Pistas cargadas: {len(pistas_cargadas)}\n\n")
            
        except Exception as e:
            # Si hay error, muestra mensaje de advertencia
            self.text_info.insert(tk.END, f"⚠️ Error al cargar datos: {str(e)}\n", 'warning')
    
    # Método para cargar vuelos desde archivo CSV
    def cargar_vuelos_desde_csv(self, archivo="vuelos.csv"):
        """Carga los vuelos desde un archivo CSV"""
        # Inicializa lista para vuelos cargados
        vuelos_cargados = []
        try:
            # Verifica si el archivo existe
            if os.path.exists(archivo):
                # Abre el archivo en modo lectura con codificación UTF-8
                with open(archivo, "r", encoding="utf-8") as f:
                    # Crea un lector de CSV que usa la primera fila como encabezados
                    reader = csv.DictReader(f)
                    # Itera por cada fila del archivo
                    for row in reader:
                        try:
                            # Obtiene el ID del vuelo, buscando en diferentes nombres de columna
                            id_vuelo = row.get('id_vuelo', row.get('id', '')).strip()
                            # Obtiene el tipo de vuelo y lo convierte a mayúsculas
                            tipo = row.get('tipo', '').strip().upper()
                            
                            # Maneja los tiempos según el tipo de vuelo
                            if tipo == "ATERRIZAJE":
                                # Para aterrizajes, busca ETA (Estimated Time of Arrival)
                                tiempo_str = row.get('eta', row.get('tiempo', '0')).strip()
                                # Convierte a entero, si hay valor
                                tiempo = int(tiempo_str) if tiempo_str else 0
                            else:
                                # Para despegues, busca ETD (Estimated Time of Departure)
                                tiempo_str = row.get('etd', row.get('tiempo', '0')).strip()
                                tiempo = int(tiempo_str) if tiempo_str else 0
                            
                            # Obtiene la prioridad y convierte a entero
                            prioridad_str = row.get('prioridad', '0').strip()
                            prioridad = int(prioridad_str) if prioridad_str else 0
                            
                            # Obtiene el combustible (solo para aterrizajes)
                            combustible_str = row.get('combustible', '0').strip()
                            combustible = int(combustible_str) if combustible_str and tipo == "ATERRIZAJE" else 0
                            
                            # Obtiene el estado, por defecto "EN_COLA"
                            estado = row.get('estado', 'EN_COLA').strip().upper()
                            # Verifica que el estado sea válido
                            if estado not in ESTADOS:
                                estado = "EN_COLA"
                            
                            # Valida que la prioridad sea 0, 1 o 2
                            if prioridad not in [0, 1, 2]:
                                prioridad = 0
                            
                            # Crea la tupla con los datos del vuelo
                            vuelo = (id_vuelo, tipo, tiempo, prioridad, combustible, estado)
                            # Agrega el vuelo a la lista
                            vuelos_cargados.append(vuelo)
                            
                        except (ValueError, KeyError) as e:
                            # Si hay error en una fila, muestra advertencia
                            self.text_info.insert(tk.END, f"⚠️ Error en fila: {str(e)}\n", 'warning')
                            
                # Muestra mensaje de éxito con cantidad de vuelos cargados
                self.text_info.insert(tk.END, f"✅ Cargados {len(vuelos_cargados)} vuelos desde {archivo}\n", 'success')
            else:
                # Si el archivo no existe, crea datos de ejemplo
                self.text_info.insert(tk.END, f"📝 Archivo {archivo} no encontrado, creando datos de ejemplo\n", 'info')
                # Crea una lista de vuelos de ejemplo
                vuelos_cargados = [
                    ("IB101", "ATERRIZAJE", 5, 0, 20, "EN_COLA"),
                    ("IB202", "ATERRIZAJE", 1, 0, 18, "EN_COLA"),
                    ("UX303", "DESPEGUE", 1, 0, 0, "EN_COLA"),
                    ("VY404", "DESPEGUE", 5, 0, 0, "EN_COLA"),
                    ("AF505", "ATERRIZAJE", 8, 0, 5, "EN_COLA")
                ]
                
        except Exception as e:
            # Si hay error general, muestra mensaje de error
            self.text_info.insert(tk.END, f"❌ Error al cargar vuelos: {str(e)}\n", 'danger')
            # Devuelve lista vacía en caso de error
            vuelos_cargados = []
            
        # Asigna la lista de vuelos al atributo de la clase
        self.vuelos = vuelos_cargados
        # Retorna la lista de vuelos cargados
        return vuelos_cargados
    
    # Método para cargar pistas desde archivo CSV
    def cargar_pistas_desde_csv(self, archivo="pistas.csv"):
        """Carga información de pistas desde archivo CSV con el formato correcto"""
        # Inicializa lista para pistas cargadas
        pistas_cargadas = []
        try:
            # Verifica si el archivo existe
            if os.path.exists(archivo):
                # Abre el archivo en modo lectura
                with open(archivo, "r", encoding="utf-8") as f:
                    # Crea un objeto para detectar si el archivo tiene encabezado
                    sniffer = csv.Sniffer()
                    # Lee una muestra del archivo (primeros 1024 bytes)
                    sample = f.read(1024)
                    # Vuelve al inicio del archivo
                    f.seek(0)
                    
                    # Verifica si el archivo tiene encabezado
                    if sniffer.has_header(sample):
                        # Si tiene encabezado, usa DictReader
                        reader = csv.DictReader(f)
                        # Itera por cada fila
                        for row in reader:
                            try:
                                # Obtiene datos de la pista
                                id_pista = row.get('id_pista', '').strip()
                                categoria = row.get('categoria', 'estandar').strip()
                                tiempo_uso = int(row.get('tiempo_uso', '3').strip())
                                habilitada = int(row.get('habilitada', '1').strip())
                                
                                # Crea la tupla de pista con estado inicial "LIBRE"
                                pista = (id_pista, categoria, tiempo_uso, habilitada, "LIBRE", None, None)
                                # Agrega la pista a la lista
                                pistas_cargadas.append(pista)
                                
                            except (ValueError, KeyError) as e:
                                # Muestra error si hay problema con una fila
                                self.text_info.insert(tk.END, f"⚠️ Error en fila de pista: {str(e)}\n", 'warning')
                    else:
                        # Si no tiene encabezado, lee como lista simple
                        f.seek(0)
                        reader = csv.reader(f)
                        for row in reader:
                            # Verifica que la fila tenga al menos 4 elementos
                            if len(row) >= 4:  # id_pista, categoria, tiempo_uso, habilitada
                                try:
                                    # Obtiene datos por posición
                                    id_pista = row[0].strip()
                                    categoria = row[1].strip()
                                    tiempo_uso = int(row[2].strip())
                                    habilitada = int(row[3].strip())
                                    
                                    # Crea la tupla de pista
                                    pista = (id_pista, categoria, tiempo_uso, habilitada, "LIBRE", None, None)
                                    pistas_cargadas.append(pista)
                                    
                                except (ValueError, IndexError) as e:
                                    # Muestra error si hay problema
                                    self.text_info.insert(tk.END, f"⚠️ Error en fila: {row} - {str(e)}\n", 'warning')
                            
                # Muestra mensaje de éxito
                self.text_info.insert(tk.END, f"✅ Cargadas {len(pistas_cargadas)} pistas desde {archivo}\n", 'success')
            else:
                # Si el archivo no existe, crea pistas por defecto
                self.text_info.insert(tk.END, f"📝 Archivo {archivo} no encontrado, creando pistas por defecto\n", 'info')
                # Crea pistas por defecto (R1 y R2 como especificaste)
                pistas_cargadas = [
                    ("R1", "larga", 3, 1, "LIBRE", None, None),
                    ("R2", "estandar", 3, 1, "LIBRE", None, None)
                ]
                
        except Exception as e:
            # Si hay error general, muestra mensaje
            self.text_info.insert(tk.END, f"❌ Error al cargar pistas: {str(e)}\n", 'danger')
            pistas_cargadas = []
            
        # Asigna la lista de pistas al atributo de la clase
        self.pistas = pistas_cargadas
        # Retorna la lista de pistas cargadas
        return pistas_cargadas
    
    # Método para actualizar la barra de estado
    def actualizar_status(self):
        """Actualizar la barra de estado"""
        # Cuenta el total de vuelos
        vuelos_total = len(self.vuelos)
        # Cuenta el total de pistas
        pistas_total = len(self.pistas)
        # Cuenta pistas libres y habilitadas
        pistas_libres = len([p for p in self.pistas if p[PISTA_ESTADO] == "LIBRE" and p[PISTA_HABILITADA] == 1])
        # Cuenta vuelos en estado EN_COLA
        vuelos_en_cola = len([v for v in self.vuelos if v[ESTADO] == "EN_COLA"])
        
        # Determina texto según estado de simulación
        estado_simulacion = " | Simulación: " + ("▶️ ACTIVA" if self.simulacion_activa else "⏸️ PAUSADA")
        
        # Actualiza el texto de la etiqueta de estado
        self.status_label.config(
            text=f"✅ Sistema operativo | Tiempo: {self.reloj_simulado} min | Vuelos: {vuelos_total} | En cola: {vuelos_en_cola} | Pistas: {pistas_total} (Libres: {pistas_libres}){estado_simulacion}"
        )
    
    # Método para mostrar la lista de vuelos
    def mostrar_vuelos(self):
        """Mostrar todos los vuelos en el área de texto"""
        # Borra todo el contenido actual del área de texto
        self.text_info.delete(1.0, tk.END)
        # Inserta título con el minuto actual de simulación
        self.text_info.insert(tk.END, f"📋 LISTA DE VUELOS REGISTRADOS (Minuto {self.reloj_simulado})\n\n", 'title')
        
        # Verifica si hay vuelos para mostrar
        if not self.vuelos:
            self.text_info.insert(tk.END, "No hay vuelos registrados\n", 'info')
            return
        
        # Crea encabezado de la tabla
        header = f"{'ID':<10} {'TIPO':<12} {'TIEMPO':<8} {'PRIORIDAD':<10} {'COMBUSTIBLE':<12} {'ESTADO':<12}\n"
        self.text_info.insert(tk.END, header, 'header')
        # Inserta línea separadora
        self.text_info.insert(tk.END, "-"*70 + "\n")
        
        # Itera por cada vuelo en la lista
        for vuelo in self.vuelos:
            # Formatea el combustible (solo para aterrizajes)
            combustible_str = str(vuelo[COMBUSTIBLE]) if vuelo[TIPO] == "ATERRIZAJE" else "N/A"
            
            # Determina texto y color según nivel de combustible
            if vuelo[TIPO] == "ATERRIZAJE":
                if vuelo[COMBUSTIBLE] <= 5:
                    combustible_tag = 'emergencia'  # Color rojo para emergencia
                    combustible_str = f"⚡{vuelo[COMBUSTIBLE]}"  # Añade icono de rayo
                elif vuelo[COMBUSTIBLE] < 15:
                    combustible_tag = 'critico'  # Color naranja para crítico
                    combustible_str = f"⚠️{vuelo[COMBUSTIBLE]}"  # Añade icono de advertencia
                else:
                    combustible_tag = 'info'  # Color normal
            else:
                combustible_tag = 'info'  # Para despegues, color normal
            
            # Convierte código de prioridad a texto descriptivo
            prioridad_texto = ""
            if vuelo[PRIORIDAD] == 2:
                prioridad_texto = "2 - Emergencia"
            elif vuelo[PRIORIDAD] == 1:
                prioridad_texto = "1 - Alta"
            else:
                prioridad_texto = "0 - Normal"
            
            # Determina color según estado del vuelo
            if vuelo[ESTADO] == "COMPLETADO":
                estado_tag = 'success'  # Verde para completado
            elif vuelo[ESTADO] == "CANCELADO":
                estado_tag = 'danger'   # Rojo para cancelado
            elif vuelo[ESTADO] == "EN_PISTA":
                estado_tag = 'warning'  # Naranja para en pista
            elif vuelo[ESTADO] == "ASIGNANDO":
                estado_tag = 'info'     # Azul oscuro para asignando
            else:
                estado_tag = 'info'     # Color normal para otros estados
            
            # Construye línea de información del vuelo
            linea = f"{vuelo[ID]:<10} {vuelo[TIPO]:<12} {vuelo[TIEMPO]:<8} {prioridad_texto:<10} "
            self.text_info.insert(tk.END, linea)
            # Inserta combustible con color correspondiente
            self.text_info.insert(tk.END, f"{combustible_str:<12}", combustible_tag)
            # Inserta estado con color correspondiente
            self.text_info.insert(tk.END, f"{vuelo[ESTADO]:<12}\n", estado_tag)
        
        # Muestra total de vuelos
        self.text_info.insert(tk.END, f"\nTotal de vuelos: {len(self.vuelos)}\n", 'info')
        
        # Filtra vuelos con combustible crítico (solo aterrizajes)
        aterrizajes_criticos = [v for v in self.vuelos if v[TIPO] == "ATERRIZAJE" and v[COMBUSTIBLE] < 15 and v[ESTADO] != "COMPLETADO"]
        if aterrizajes_criticos:
            self.text_info.insert(tk.END, f"\n⚠️  VUELOS CON COMBUSTIBLE CRÍTICO:\n", 'warning')
            for vuelo in aterrizajes_criticos:
                if vuelo[COMBUSTIBLE] <= 5:
                    self.text_info.insert(tk.END, f"  ⚡ {vuelo[ID]}: {vuelo[COMBUSTIBLE]} min - EMERGENCIA\n", 'emergencia')
                else:
                    self.text_info.insert(tk.END, f"  ⚠️  {vuelo[ID]}: {vuelo[COMBUSTIBLE]} min - CRÍTICO\n", 'critico')
        
        # Filtra vuelos que están actualmente en pista
        vuelos_en_pista = [v for v in self.vuelos if v[ESTADO] == "EN_PISTA"]
        if vuelos_en_pista:
            self.text_info.insert(tk.END, f"\n🛬 VUELOS EN PISTA:\n", 'header')
            for vuelo in vuelos_en_pista:
                # Obtiene tiempo restante del diccionario (0 si no existe)
                tiempo_restante = self.tiempo_en_pista.get(vuelo[ID], 0)
                # Busca en qué pista está este vuelo
                pista_asignada = None
                for pista in self.pistas:
                    if pista[PISTA_VUELO_ACTUAL] == vuelo[ID]:
                        pista_asignada = pista[PISTA_ID]
                        break
                
                # Muestra información del vuelo en pista
                if pista_asignada:
                    self.text_info.insert(tk.END, f"  {vuelo[ID]}: {tiempo_restante} min restantes en pista {pista_asignada}\n", 'warning')
                else:
                    self.text_info.insert(tk.END, f"  {vuelo[ID]}: {tiempo_restante} min restantes\n", 'warning')
        
        # Actualiza la barra de estado
        self.actualizar_status()
    
    # Método para mostrar información de las pistas
    def mostrar_pistas(self):
        """Mostrar información de las pistas"""
        # Borra contenido actual del área de texto
        self.text_info.delete(1.0, tk.END)
        # Inserta título con minuto actual
        self.text_info.insert(tk.END, f"🛬 ESTADO DE LAS PISTAS (Minuto {self.reloj_simulado})\n\n", 'title')
        
        # Verifica si hay pistas para mostrar
        if not self.pistas:
            self.text_info.insert(tk.END, "No hay pistas registradas\n", 'info')
            return
        
        # Crea encabezado de la tabla de pistas
        header = f"{'ID':<6} {'CATEGORÍA':<12} {'TIEMPO USO':<10} {'ESTADO':<12} {'HABILITADA':<12} {'VUELO':<10} {'FIN EN':<8}\n"
        self.text_info.insert(tk.END, header, 'header')
        # Inserta línea separadora
        self.text_info.insert(tk.END, "-"*70 + "\n")
        
        # Itera por cada pista en la lista
        for pista in self.pistas:
            # Determina color y texto según estado de la pista
            if pista[PISTA_HABILITADA] == 0:
                estado_tag = 'pista_deshabilitada'  # Rojo para deshabilitada
                estado_str = "🔴 DESHAB."  # Texto con icono rojo
            elif pista[PISTA_ESTADO] == "OCUPADA":
                estado_tag = 'pista_ocupada'  # Naranja para ocupada
                estado_str = "🟡 OCUPADA"  # Texto con icono amarillo
            else:
                estado_tag = 'pista_libre'  # Verde para libre
                estado_str = "🟢 LIBRE"  # Texto con icono verde
            
            # Obtiene información del vuelo actual (None si no hay)
            vuelo_actual = pista[PISTA_VUELO_ACTUAL] if pista[PISTA_VUELO_ACTUAL] else "---"
            
            # Calcula tiempo restante si la pista está ocupada
            if pista[PISTA_TIEMPO_FIN] and pista[PISTA_ESTADO] == "OCUPADA":
                tiempo_restante = pista[PISTA_TIEMPO_FIN] - self.reloj_simulado
                tiempo_fin = f"{max(0, tiempo_restante)} min"  # No mostrar negativo
            else:
                tiempo_fin = "---"  # Guiones si no hay vuelo
            
            # Construye línea de información básica de la pista
            linea = f"{pista[PISTA_ID]:<6} {pista[PISTA_CATEGORIA]:<12} {pista[PISTA_TIEMPO_USO]:<10} "
            self.text_info.insert(tk.END, linea)
            # Inserta estado con color correspondiente
            self.text_info.insert(tk.END, f"{estado_str:<12}", estado_tag)
            
            # Formatea texto de habilitada (sí/no con icono)
            habilitada_str = "✅ SÍ" if pista[PISTA_HABILITADA] == 1 else "❌ NO"
            # Inserta resto de la información
            self.text_info.insert(tk.END, f"{habilitada_str:<12} {vuelo_actual:<10} {tiempo_fin:<8}\n")
        
        # Calcula estadísticas de pistas
        pistas_libres = len([p for p in self.pistas if p[PISTA_ESTADO] == "LIBRE" and p[PISTA_HABILITADA] == 1])
        pistas_ocupadas = len([p for p in self.pistas if p[PISTA_ESTADO] == "OCUPADA"])
        pistas_deshabilitadas = len([p for p in self.pistas if p[PISTA_HABILITada] == 0])
        
        # Muestra estadísticas
        self.text_info.insert(tk.END, f"\n📊 ESTADÍSTICAS DE PISTAS:\n", 'header')
        self.text_info.insert(tk.END, f"  🟢 Pistas libres: {pistas_libres}\n", 'pista_libre')
        self.text_info.insert(tk.END, f"  🟡 Pistas ocupadas: {pistas_ocupadas}\n", 'pista_ocupada')
        self.text_info.insert(tk.END, f"  🔴 Pistas deshabilitadas: {pistas_deshabilitadas}\n", 'pista_deshabilitada')
        self.text_info.insert(tk.END, f"  📋 Total de pistas: {len(self.pistas)}\n")
        
        # Muestra detalles específicos de pistas ocupadas
        pistas_ocupadas_lista = [p for p in self.pistas if p[PISTA_ESTADO] == "OCUPADA"]
        if pistas_ocupadas_lista:
            self.text_info.insert(tk.END, f"\n📋 DETALLES DE PISTAS OCUPADAS:\n", 'header')
            for pista in pistas_ocupadas_lista:
                tiempo_restante = pista[PISTA_TIEMPO_FIN] - self.reloj_simulado if pista[PISTA_TIEMPO_FIN] else 0
                self.text_info.insert(tk.END, f"  Pista {pista[PISTA_ID]}: {pista[PISTA_VUELO_ACTUAL]} - {tiempo_restante} min restantes\n", 'pista_ocupada')
    
    # Método para abrir diálogo de gestión de pistas
    def gestionar_pistas_dialog(self):
        """Diálogo para gestionar pistas"""
        # Crea una nueva ventana (Toplevel) para el diálogo
        dialog = tk.Toplevel(self.root)
        dialog.title("Gestión de Pistas")  # Título de la ventana
        dialog.geometry("600x500")  # Tamaño de la ventana
        dialog.configure(bg='#f0f0f0')  # Color de fondo
        dialog.transient(self.root)  # Hace que sea ventana hija de la principal
        dialog.grab_set()  # Hace que la ventana sea modal (bloquea la principal)
        
        # Crea título del diálogo
        ttk.Label(dialog, text="🔧 GESTIÓN DE PISTAS", font=('Helvetica', 14, 'bold')).grid(row=0, column=0, columnspan=3, pady=10)
        
        # Crea frame para la lista de pistas
        list_frame = ttk.Frame(dialog)
        list_frame.grid(row=1, column=0, columnspan=3, padx=10, pady=10, sticky=(tk.W, tk.E))
        
        # Define nombres de columnas para el treeview (tabla)
        columns = ('id', 'categoria', 'tiempo_uso', 'habilitada', 'estado', 'vuelo', 'fin')
        # Crea widget Treeview para mostrar pistas en forma de tabla
        tree = ttk.Treeview(list_frame, columns=columns, show='headings', height=8)
        
        # Configura encabezados de las columnas
        tree.heading('id', text='ID')
        tree.heading('categoria', text='Categoría')
        tree.heading('tiempo_uso', text='Tiempo Uso')
        tree.heading('habilitada', text='Habilitada')
        tree.heading('estado', text='Estado')
        tree.heading('vuelo', text='Vuelo Actual')
        tree.heading('fin', text='Termina en')
        
        # Configura ancho de columnas
        tree.column('id', width=50)
        tree.column('categoria', width=80)
        tree.column('tiempo_uso', width=80)
        tree.column('habilitada', width=80)
        tree.column('estado', width=80)
        tree.column('vuelo', width=80)
        tree.column('fin', width=80)
        
        # Crea barra de scroll vertical
        scrollbar = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=tree.yview)
        tree.configure(yscrollcommand=scrollbar.set)  # Conecta treeview con scrollbar
        
        # Posiciona treeview y scrollbar
        tree.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        scrollbar.grid(row=0, column=1, sticky=(tk.N, tk.S))
        
        # Llama a método para llenar el treeview con datos
        self.actualizar_treeview_pistas(tree)
        
        # Crea frame para botones de acción
        action_frame = ttk.Frame(dialog)
        action_frame.grid(row=2, column=0, columnspan=3, pady=10)
        
        # Función interna para actualizar el treeview
        def actualizar_treeview():
            """Actualizar el treeview de pistas"""
            # Elimina todos los elementos actuales del treeview
            for item in tree.get_children():
                tree.delete(item)
            # Vuelve a llenar con datos actualizados
            self.actualizar_treeview_pistas(tree)
        
        # Función interna para agregar nueva pista
        def agregar_pista():
            """Agregar una nueva pista"""
            # Crea sub-diálogo para agregar pista
            subdialog = tk.Toplevel(dialog)
            subdialog.title("Agregar Pista")
            subdialog.geometry("400x350")
            
            # Título del sub-diálogo
            ttk.Label(subdialog, text="➕ AGREGAR NUEVA PISTA", font=('Helvetica', 12, 'bold')).grid(row=0, column=0, columnspan=2, pady=10)
            
            # Campos del formulario para nueva pista
            ttk.Label(subdialog, text="ID Pista:").grid(row=1, column=0, padx=10, pady=5, sticky=tk.W)
            id_var = tk.StringVar()  # Variable para ID de pista
            ttk.Entry(subdialog, textvariable=id_var, width=30).grid(row=1, column=1, padx=10, pady=5)
            
            ttk.Label(subdialog, text="Categoría:").grid(row=2, column=0, padx=10, pady=5, sticky=tk.W)
            categoria_var = tk.StringVar(value="estandar")  # Valor por defecto
            ttk.Combobox(subdialog, textvariable=categoria_var, values=["corta", "estandar", "larga"], state="readonly", width=28).grid(row=2, column=1, padx=10, pady=5)
            
            ttk.Label(subdialog, text="Tiempo Uso (min):").grid(row=3, column=0, padx=10, pady=5, sticky=tk.W)
            tiempo_var = tk.StringVar(value="3")  # Valor por defecto 3 minutos
            ttk.Entry(subdialog, textvariable=tiempo_var, width=30).grid(row=3, column=1, padx=10, pady=5)
            
            ttk.Label(subdialog, text="Habilitada:").grid(row=4, column=0, padx=10, pady=5, sticky=tk.W)
            habilitada_var = tk.StringVar(value="1")  # Valor por defecto habilitada
            ttk.Combobox(subdialog, textvariable=habilitada_var, values=["1 - Sí", "0 - No"], state="readonly", width=28).grid(row=4, column=1, padx=10, pady=5)
            
            # Función interna para guardar la nueva pista
            def guardar_pista():
                try:
                    # Obtiene y limpia el ID de pista
                    id_pista = id_var.get().strip()
                    if not id_pista:
                        messagebox.showerror("Error", "El ID de pista es obligatorio")
                        return
                    
                    # Verifica si ya existe una pista con ese ID
                    if any(p[PISTA_ID] == id_pista for p in self.pistas):
                        messagebox.showerror("Error", f"Ya existe una pista con ID {id_pista}")
                        return
                    
                    # Obtiene otros valores del formulario
                    categoria = categoria_var.get()
                    tiempo_uso = int(tiempo_var.get())
                    habilitada = int(habilitada_var.get().split(" - ")[0])  # Extrae número del texto
                    
                    # Crea nueva tupla de pista
                    nueva_pista = (id_pista, categoria, tiempo_uso, habilitada, "LIBRE", None, None)
                    self.pistas.append(nueva_pista)  # Agrega a la lista
                    
                    # Muestra mensaje de éxito
                    self.text_info.insert(tk.END, f"✅ Pista {id_pista} agregada exitosamente\n", 'success')
                    self.actualizar_status()  # Actualiza barra de estado
                    actualizar_treeview()  # Actualiza treeview
                    subdialog.destroy()  # Cierra el sub-diálogo
                    
                except ValueError:
                    messagebox.showerror("Error", "Por favor, ingrese valores numéricos válidos")
                except Exception as e:
                    messagebox.showerror("Error", f"Error al agregar pista: {str(e)}")
            
            # Crea frame para botones del sub-diálogo
            button_frame = ttk.Frame(subdialog)
            button_frame.grid(row=5, column=0, columnspan=2, pady=20)
            
            # Botones del sub-diálogo
            ttk.Button(button_frame, text="Guardar", command=guardar_pista).pack(side=tk.LEFT, padx=5)
            ttk.Button(button_frame, text="Cancelar", command=subdialog.destroy).pack(side=tk.LEFT, padx=5)
        
        # Función interna para habilitar/deshabilitar pista seleccionada
        def habilitar_deshabilitar():
            """Habilitar o deshabilitar pista seleccionada"""
            # Obtiene la selección actual del treeview
            seleccion = tree.selection()
            if not seleccion:
                messagebox.showinfo("Información", "Seleccione una pista")
                return
            
            # Obtiene valores del item seleccionado
            item = seleccion[0]
            valores = tree.item(item, 'values')
            id_pista = valores[0]  # ID está en primera columna
            
            # Busca la pista en la lista
            for i, pista in enumerate(self.pistas):
                if pista[PISTA_ID] == id_pista:
                    # Cambia estado de habilitada (1->0 o 0->1)
                    nueva_habilitada = 0 if pista[PISTA_HABILITADA] == 1 else 1
                    
                    # Verifica que no se pueda deshabilitar pista ocupada
                    if nueva_habilitada == 0 and pista[PISTA_ESTADO] == "OCUPADA":
                        messagebox.showwarning("Advertencia", "No se puede deshabilitar una pista ocupada")
                        return
                    
                    # Actualiza la pista en la lista
                    self.pistas[i] = (
                        pista[PISTA_ID],
                        pista[PISTA_CATEGORIA],
                        pista[PISTA_TIEMPO_USO],
                        nueva_habilitada,
                        "DESHABILITADA" if nueva_habilitada == 0 else "LIBRE",
                        None,
                        None
                    )
                    
                    # Muestra mensaje de acción realizada
                    accion = "deshabilitada" if nueva_habilitada == 0 else "habilitada"
                    self.text_info.insert(tk.END, f"✅ Pista {id_pista} {accion}\n", 'success')
                    self.actualizar_status()  # Actualiza barra de estado
                    actualizar_treeview()  # Actualiza treeview
                    break
        
        # Función interna para liberar pista ocupada (emergencia)
        def liberar_pista():
            """Liberar pista ocupada (emergencia)"""
            # Obtiene selección del treeview
            seleccion = tree.selection()
            if not seleccion:
                messagebox.showinfo("Información", "Seleccione una pista")
                return
            
            # Obtiene valores del item seleccionado
            item = seleccion[0]
            valores = tree.item(item, 'values')
            id_pista = valores[0]
            
            # Busca la pista en la lista
            for i, pista in enumerate(self.pistas):
                if pista[PISTA_ID] == id_pista:
                    # Verifica que la pista esté ocupada
                    if pista[PISTA_ESTADO] != "OCUPADA":
                        messagebox.showinfo("Información", "La pista no está ocupada")
                        return
                    
                    # Pide confirmación al usuario
                    if messagebox.askyesno("Confirmar", f"¿Liberar pista {id_pista}? Esto cancelará el vuelo {pista[PISTA_VUELO_ACTUAL]}"):
                        # Obtiene ID del vuelo que está usando la pista
                        vuelo_id = pista[PISTA_VUELO_ACTUAL]
                        # Busca y cancela el vuelo
                        for j, vuelo in enumerate(self.vuelos):
                            if vuelo[ID] == vuelo_id:
                                self.vuelos[j] = (
                                    vuelo[ID],
                                    vuelo[TIPO],
                                    vuelo[TIEMPO],
                                    vuelo[PRIORIDAD],
                                    vuelo[COMBUSTIBLE],
                                    "CANCELADO"
                                )
                                break
                        
                        # Libera la pista (estado LIBRE, sin vuelo)
                        self.pistas[i] = (
                            pista[PISTA_ID],
                            pista[PISTA_CATEGORIA],
                            pista[PISTA_TIEMPO_USO],
                            pista[PISTA_HABILITADA],
                            "LIBRE",
                            None,
                            None
                        )
                        
                        # Elimina del registro de tiempos en pista
                        if vuelo_id in self.tiempo_en_pista:
                            del self.tiempo_en_pista[vuelo_id]
                        
                        # Muestra mensaje de acción
                        self.text_info.insert(tk.END, f"⚠️ Pista {id_pista} liberada. Vuelo {vuelo_id} cancelado\n", 'warning')
                        self.actualizar_status()  # Actualiza barra de estado
                        actualizar_treeview()  # Actualiza treeview
                    break
        
        # Crea botones de acción en el diálogo principal
        ttk.Button(action_frame, text="➕ Agregar Pista", command=agregar_pista, width=20).pack(side=tk.LEFT, padx=5)
        ttk.Button(action_frame, text="🔄 Habilitar/Deshabilitar", command=habilitar_deshabilitar, width=20).pack(side=tk.LEFT, padx=5)
        ttk.Button(action_frame, text="🆓 Liberar Pista", command=liberar_pista, width=20).pack(side=tk.LEFT, padx=5)
        
        # Botón para cerrar el diálogo
        ttk.Button(dialog, text="Cerrar", command=dialog.destroy, width=20).grid(row=3, column=0, columnspan=3, pady=10)
    
    # Método para actualizar el treeview con datos actuales de pistas
    def actualizar_treeview_pistas(self, tree):
        """Actualizar el treeview con datos de pistas actuales"""
        # Itera por cada pista en la lista
        for pista in self.pistas:
            # Formatea texto de habilitada con icono
            habilitada = "✅ Sí" if pista[PISTA_HABILITADA] == 1 else "❌ No"
            # Obtiene vuelo actual o muestra guiones
            vuelo_actual = pista[PISTA_VUELO_ACTUAL] if pista[PISTA_VUELO_ACTUAL] else "---"
            
            # Calcula tiempo restante si la pista está ocupada
            if pista[PISTA_TIEMPO_FIN] and pista[PISTA_ESTADO] == "OCUPADA":
                tiempo_restante = pista[PISTA_TIEMPO_FIN] - self.reloj_simulado
                tiempo_fin = f"{max(0, tiempo_restante)} min"  # No mostrar negativo
            else:
                tiempo_fin = "---"  # Guiones si no hay vuelo
            
            # Inserta fila en el treeview con todos los valores
            tree.insert('', tk.END, values=(
                pista[PISTA_ID],
                pista[PISTA_CATEGORIA],
                pista[PISTA_TIEMPO_USO],
                habilitada,
                pista[PISTA_ESTADO],
                vuelo_actual,
                tiempo_fin
            ))
    
    # Método para abrir diálogo de agregar vuelo
    def agregar_vuelo_dialog(self):
        """Diálogo para agregar un nuevo vuelo"""
        # Crea nueva ventana para el diálogo
        dialog = tk.Toplevel(self.root)
        dialog.title("Agregar Nuevo Vuelo")
        dialog.geometry("500x450")
        dialog.configure(bg='#f0f0f0')
        dialog.transient(self.root)
        dialog.grab_set()  # Modal
        
        # Variables para almacenar datos del formulario
        id_var = tk.StringVar()  # ID del vuelo
        tipo_var = tk.StringVar(value="ATERRIZAJE")  # Tipo, por defecto ATERRIZAJE
        tiempo_var = tk.StringVar()  # Tiempo ETA/ETD
        prioridad_var = tk.StringVar(value="0")  # Prioridad, por defecto 0
        combustible_var = tk.StringVar()  # Combustible
        
        # Título del diálogo
        ttk.Label(dialog, text="✈️ AGREGAR NUEVO VUELO", font=('Helvetica', 14, 'bold')).grid(row=0, column=0, columnspan=2, pady=10)
        
        # Define campos del formulario (etiqueta, variable, opciones)
        fields = [
            ("ID del Vuelo:", id_var, None),  # Campo de texto simple
            ("Tipo:", tipo_var, ["ATERRIZAJE", "DESPEGUE"]),  # Combobox
            ("ETA/ETD (minuto):", tiempo_var, None),  # Campo de texto
            ("Prioridad:", prioridad_var, ["0 - Normal", "1 - Alta", "2 - Emergencia"]),  # Combobox
            ("Combustible (minutos):", combustible_var, None)  # Campo de texto
        ]
        
        # Crea cada campo del formulario
        for i, (label, var, options) in enumerate(fields, start=1):
            # Crea etiqueta del campo
            ttk.Label(dialog, text=label).grid(row=i, column=0, sticky=tk.W, padx=10, pady=5)
            
            if options:
                # Si hay opciones, crea combobox
                combobox = ttk.Combobox(dialog, textvariable=var, values=options, state="readonly", width=30)
                combobox.grid(row=i, column=1, padx=10, pady=5)
                
                # Configura valor por defecto para prioridad
                if label == "Prioridad:":
                    var.set("0 - Normal")
            else:
                # Si no hay opciones, crea campo de texto
                entry = ttk.Entry(dialog, textvariable=var, width=32)
                entry.grid(row=i, column=1, padx=10, pady=5)
                
                # Enfoca el campo de ID al abrir el diálogo
                if label == "ID del Vuelo:":
                    entry.focus_set()
        
        # Función interna para agregar el vuelo
        def agregar():
            try:
                # Obtiene y limpia ID del vuelo
                id_vuelo = id_var.get().strip().upper()
                if not id_vuelo:
                    messagebox.showerror("Error", "El ID del vuelo es obligatorio")
                    return
                
                # Verifica si el vuelo ya existe
                if any(v[ID] == id_vuelo for v in self.vuelos):
                    messagebox.showerror("Error", f"Ya existe un vuelo con ID {id_vuelo}")
                    return
                
                # Obtiene otros valores
                tipo = tipo_var.get()
                tiempo = int(tiempo_var.get())
                # Extrae número de prioridad del texto (ej: "0 - Normal" -> 0)
                prioridad = int(prioridad_var.get().split(" - ")[0])
                
                # Valida prioridad
                if prioridad not in [0, 1, 2]:
                    messagebox.showerror("Error", "Prioridad debe ser 0, 1 o 2")
                    return
                
                # Obtiene combustible (solo para aterrizajes)
                combustible = int(combustible_var.get()) if tipo == "ATERRIZAJE" else 0
                if tipo == "ATERRIZAJE" and combustible < 0:
                    messagebox.showerror("Error", "El combustible no puede ser negativo")
                    return
                
                # Crea nueva tupla de vuelo
                nuevo_vuelo = (id_vuelo, tipo, tiempo, prioridad, combustible, "EN_COLA")
                self.vuelos.append(nuevo_vuelo)  # Agrega a la lista
                
                # Muestra mensaje de éxito
                self.text_info.insert(tk.END, f"✅ Vuelo {id_vuelo} agregado exitosamente\n", 'success')
                self.actualizar_status()  # Actualiza barra de estado
                dialog.destroy()  # Cierra diálogo
                
            except ValueError:
                messagebox.showerror("Error", "Por favor, ingrese valores numéricos válidos")
            except Exception as e:
                messagebox.showerror("Error", f"Error al agregar vuelo: {str(e)}")
        
        # Crea frame para botones
        button_frame = ttk.Frame(dialog)
        button_frame.grid(row=len(fields)+2, column=0, columnspan=2, pady=20)
        
        # Botones del diálogo
        ttk.Button(button_frame, text="Agregar", command=agregar, width=15).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Cancelar", command=dialog.destroy, width=15).pack(side=tk.LEFT, padx=5)
    
    # Método para abrir diálogo de actualización de estado de vuelo
    def actualizar_estado_dialog(self):
        """Diálogo para actualizar estado de un vuelo"""
        # Verifica si hay vuelos para actualizar
        if not self.vuelos:
            messagebox.showinfo("Información", "No hay vuelos para actualizar")
            return
        
        # Crea nueva ventana para el diálogo
        dialog = tk.Toplevel(self.root)
        dialog.title("Actualizar Estado de Vuelo")
        dialog.geometry("500x300")
        dialog.configure(bg='#f0f0f0')
        dialog.transient(self.root)
        dialog.grab_set()
        
        # Título del diálogo
        ttk.Label(dialog, text="🔄 ACTUALIZAR ESTADO DE VUELO", font=('Helvetica', 14, 'bold')).grid(row=0, column=0, columnspan=2, pady=10)
        
        # Campo para seleccionar vuelo
        ttk.Label(dialog, text="Seleccionar Vuelo:").grid(row=1, column=0, sticky=tk.W, padx=10, pady=5)
        
        # Obtiene lista de IDs de vuelos
        vuelos_ids = [v[ID] for v in self.vuelos]
        vuelo_var = tk.StringVar()
        vuelo_combobox = ttk.Combobox(dialog, textvariable=vuelo_var, values=vuelos_ids, state="readonly", width=30)
        vuelo_combobox.grid(row=1, column=1, padx=10, pady=5)
        
        # Si hay vuelos, selecciona el primero por defecto
        if vuelos_ids:
            vuelo_var.set(vuelos_ids[0])
        
        # Campo para seleccionar nuevo estado
        ttk.Label(dialog, text="Nuevo Estado:").grid(row=2, column=0, sticky=tk.W, padx=10, pady=5)
        
        estado_var = tk.StringVar(value=ESTADOS[0])  # Primer estado por defecto
        estado_combobox = ttk.Combobox(dialog, textvariable=estado_var, values=ESTADOS, state="readonly", width=30)
        estado_combobox.grid(row=2, column=1, padx=10, pady=5)
        
        # Función interna para actualizar el estado
        def actualizar():
            # Obtiene valores seleccionados
            id_vuelo = vuelo_var.get()
            nuevo_estado = estado_var.get()
            
            if not id_vuelo:
                messagebox.showerror("Error", "Seleccione un vuelo")
                return
            
            # Busca el vuelo por ID
            for i, vuelo in enumerate(self.vuelos):
                if vuelo[ID] == id_vuelo:
                    # Actualiza solo el estado, manteniendo otros datos
                    self.vuelos[i] = (vuelo[ID], vuelo[TIPO], vuelo[TIEMPO], 
                                     vuelo[PRIORIDAD], vuelo[COMBUSTIBLE], nuevo_estado)
                    
                    # Muestra mensaje de éxito
                    self.text_info.insert(tk.END, f"✅ Vuelo {id_vuelo} actualizado a: {nuevo_estado}\n", 'success')
                    self.actualizar_status()  # Actualiza barra de estado
                    dialog.destroy()  # Cierra diálogo
                    return
            
            # Si no encuentra el vuelo, muestra error
            messagebox.showerror("Error", f"Vuelo {id_vuelo} no encontrado")
        
        # Crea frame para botones
        button_frame = ttk.Frame(dialog)
        button_frame.grid(row=3, column=0, columnspan=2, pady=20)
        
        # Botones del diálogo
        ttk.Button(button_frame, text="Actualizar", command=actualizar, width=15).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Cancelar", command=dialog.destroy, width=15).pack(side=tk.LEFT, padx=5)
    
    # Método para abrir diálogo de cancelación de vuelo
    def cancelar_vuelo_dialog(self):
        """Diálogo para cancelar un vuelo"""
        # Verifica si hay vuelos
        if not self.vuelos:
            messagebox.showinfo("Información", "No hay vuelos para cancelar")
            return
        
        # Crea nueva ventana para el diálogo
        dialog = tk.Toplevel(self.root)
        dialog.title("Cancelar Vuelo")
        dialog.geometry("500x250")
        dialog.configure(bg='#f0f0f0')
        dialog.transient(self.root)
        dialog.grab_set()
        
        # Título del diálogo
        ttk.Label(dialog, text="❌ CANCELAR VUELO", font=('Helvetica', 14, 'bold')).grid(row=0, column=0, columnspan=2, pady=10)
        
        # Filtra vuelos que pueden ser cancelados (no COMPLETADOS)
        vuelos_cancelables = [v for v in self.vuelos if v[ESTADO] != "COMPLETADO"]
        if not vuelos_cancelables:
            messagebox.showinfo("Información", "No hay vuelos cancelables (todos están COMPLETADOS)")
            dialog.destroy()
            return
        
        # Campo para seleccionar vuelo
        ttk.Label(dialog, text="Seleccionar Vuelo a Cancelar:").grid(row=1, column=0, sticky=tk.W, padx=10, pady=5)
        
        # Crea lista descriptiva de vuelos cancelables
        vuelos_ids = [f"{v[ID]} - {v[TIPO]} ({v[ESTADO]})" for v in vuelos_cancelables]
        vuelo_var = tk.StringVar()
        vuelo_combobox = ttk.Combobox(dialog, textvariable=vuelo_var, values=vuelos_ids, state="readonly", width=40)
        vuelo_combobox.grid(row=1, column=1, padx=10, pady=5)
        vuelo_var.set(vuelos_ids[0])  # Selecciona primero por defecto
        
        # Función interna para cancelar el vuelo
        def cancelar():
            # Obtiene selección
            seleccion = vuelo_var.get()
            if not seleccion:
                messagebox.showerror("Error", "Seleccione un vuelo")
                return
            
            # Extrae ID del vuelo del texto (ej: "IB101 - ATERRIZAJE (EN_COLA)" -> "IB101")
            id_vuelo = seleccion.split(" - ")[0]
            
            # Pide confirmación al usuario
            if messagebox.askyesno("Confirmar", f"¿Está seguro de cancelar el vuelo {id_vuelo}?"):
                # Busca el vuelo por ID
                for i, vuelo in enumerate(self.vuelos):
                    if vuelo[ID] == id_vuelo:
                        # Actualiza estado a CANCELADO
                        self.vuelos[i] = (vuelo[ID], vuelo[TIPO], vuelo[TIEMPO], 
                                         vuelo[PRIORIDAD], vuelo[COMBUSTIBLE], "CANCELADO")
                        
                        # Si estaba en pista, libera la pista
                        for j, pista in enumerate(self.pistas):
                            if pista[PISTA_VUELO_ACTUAL] == id_vuelo:
                                self.pistas[j] = (
                                    pista[PISTA_ID],
                                    pista[PISTA_CATEGORIA],
                                    pista[PISTA_TIEMPO_USO],
                                    pista[PISTA_HABILITADA],
                                    "LIBRE",
                                    None,
                                    None
                                )
                                break
                        
                        # Elimina del registro de tiempos en pista
                        if id_vuelo in self.tiempo_en_pista:
                            del self.tiempo_en_pista[id_vuelo]
                        
                        # Muestra mensaje de éxito
                        self.text_info.insert(tk.END, f"✅ Vuelo {id_vuelo} ha sido cancelado\n", 'success')
                        self.actualizar_status()  # Actualiza barra de estado
                        dialog.destroy()  # Cierra diálogo
                        return
        
        # Crea frame para botones
        button_frame = ttk.Frame(dialog)
        button_frame.grid(row=2, column=0, columnspan=2, pady=20)
        
        # Botones del diálogo
        ttk.Button(button_frame, text="Cancelar Vuelo", command=cancelar, width=15).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Cerrar", command=dialog.destroy, width=15).pack(side=tk.LEFT, padx=5)
    
    # Método para generar informe detallado
    def generar_informe(self):
        """Generar un informe detallado"""
        try:
            # Obtiene fecha y hora actual
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            # Borra contenido actual
            self.text_info.delete(1.0, tk.END)
            # Inserta título con timestamp
            self.text_info.insert(tk.END, f"📊 INFORME DETALLADO - {timestamp}\n\n", 'title')
            
            # Sección de estadísticas generales
            self.text_info.insert(tk.END, "📈 ESTADÍSTICAS GENERALES\n", 'header')
            self.text_info.insert(tk.END, f"Total de vuelos: {len(self.vuelos)}\n")
            self.text_info.insert(tk.END, f"Tiempo simulado: {self.reloj_simulado} minutos\n")
            
            # Estadísticas por tipo de vuelo
            aterrizajes = [v for v in self.vuelos if v[TIPO] == "ATERRIZAJE"]
            despegues = [v for v in self.vuelos if v[TIPO] == "DESPEGUE"]
            self.text_info.insert(tk.END, f"Vuelos de aterrizaje: {len(aterrizajes)}\n")
            self.text_info.insert(tk.END, f"Vuelos de despegue: {len(despegues)}\n\n")
            
            # Distribución por estado
            self.text_info.insert(tk.END, "📊 DISTRIBUCIÓN POR ESTADO\n", 'header')
            for estado in ESTADOS:
                count = len([v for v in self.vuelos if v[ESTADO] == estado])
                porcentaje = (count / len(self.vuelos) * 100) if self.vuelos else 0
                self.text_info.insert(tk.END, f"  {estado}: {count} vuelos ({porcentaje:.1f}%)\n")
            
            # Distribución por prioridad
            self.text_info.insert(tk.END, "\n🎯 DISTRIBUCIÓN POR PRIORIDAD\n", 'header')
            for prioridad in [0, 1, 2]:
                count = len([v for v in self.vuelos if v[PRIORIDAD] == prioridad])
                self.text_info.insert(tk.END, f"  Prioridad {prioridad}: {count} vuelos\n")
            
            # Vuelos con combustible crítico
            self.text_info.insert(tk.END, "\n⚠️ VUELOS CON COMBUSTIBLE CRÍTICO (<15 min)\n", 'header')
            criticos = [v for v in aterrizajes if v[COMBUSTIBLE] < 15 and v[ESTADO] != "COMPLETADO"]
            
            if criticos:
                for vuelo in criticos:
                    # Clasifica nivel de emergencia
                    nivel = "⚡ EMERGENCIA" if vuelo[COMBUSTIBLE] <= 5 else "⚠️ CRÍTICO"
                    self.text_info.insert(tk.END, f"  ✈️ {vuelo[ID]}: {vuelo[COMBUSTIBLE]} minutos restantes ({nivel})\n", 'warning')
            else:
                self.text_info.insert(tk.END, "  No hay vuelos con combustible crítico\n", 'success')
            
            # Información de pistas
            self.text_info.insert(tk.END, f"\n🛬 INFORMACIÓN DE PISTAS ({len(self.pistas)} total)\n", 'header')
            for pista in self.pistas:
                estado = "HABILITADA" if pista[PISTA_HABILITADA] == 1 else "DESHABILITADA"
                estado_ocupacion = "OCUPADA" if pista[PISTA_ESTADO] == "OCUPADA" else "LIBRE"
                vuelo_info = f" por {pista[PISTA_VUELO_ACTUAL]}" if pista[PISTA_VUELO_ACTUAL] else ""
                self.text_info.insert(tk.END, f"  Pista {pista[PISTA_ID]}: {pista[PISTA_CATEGORIA]} - {estado} - {estado_ocupacion}{vuelo_info}\n")
            
            # Guarda el informe en un archivo de texto
            archivo_informe = f"informe_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
            with open(archivo_informe, "w", encoding="utf-8") as f:
                contenido = self.text_info.get(1.0, tk.END)
                f.write(contenido)
            
            # Muestra mensaje de éxito con nombre del archivo
            self.text_info.insert(tk.END, f"\n✅ Informe guardado en: {archivo_informe}\n", 'success')
            
        except Exception as e:
            messagebox.showerror("Error", f"Error al generar informe: {str(e)}")
    
    # Método para mostrar estadísticas en tiempo real
    def mostrar_estadisticas(self):
        """Mostrar estadísticas en tiempo real"""
        # Borra contenido actual
        self.text_info.delete(1.0, tk.END)
        # Inserta título con minuto actual
        self.text_info.insert(tk.END, f"📈 ESTADÍSTICAS EN TIEMPO REAL (Minuto {self.reloj_simulado})\n\n", 'title')
        
        # Verifica si hay datos
        if not self.vuelos:
            self.text_info.insert(tk.END, "No hay datos disponibles\n", 'info')
            return
        
        # Estadísticas básicas
        total = len(self.vuelos)
        self.text_info.insert(tk.END, f"📊 TOTAL DE VUELOS: {total}\n\n", 'header')
        
        # Distribución por estado con barras de progreso
        estados_data = []
        for estado in ESTADOS:
            count = len([v for v in self.vuelos if v[ESTADO] == estado])
            porcentaje = (count / total * 100) if total > 0 else 0
            estados_data.append((estado, count, porcentaje))
        
        self.text_info.insert(tk.END, "📋 DISTRIBUCIÓN POR ESTADO:\n", 'header')
        for estado, count, porcentaje in estados_data:
            # Crea barra de progreso simple con caracteres ASCII
            barra = "█" * int(porcentaje / 5)  # Cada 5% = un carácter
            self.text_info.insert(tk.END, f"  {estado:<12}: {count:>3} ({porcentaje:>5.1f}%) {barra}\n")
        
        # Distribución por tipo de vuelo
        self.text_info.insert(tk.END, "\n✈️ DISTRIBUCIÓN POR TIPO:\n", 'header')
        aterrizajes = len([v for v in self.vuelos if v[TIPO] == "ATERRIZAJE"])
        despegues = len([v for v in self.vuelos if v[TIPO] == "DESPEGUE"])
        
        self.text_info.insert(tk.END, f"  ATERRIZAJE: {aterrizajes} ({aterrizajes/total*100:.1f}%)\n")
        self.text_info.insert(tk.END, f"  DESPEGUE:   {despegues} ({despegues/total*100:.1f}%)\n")
        
        # Análisis de combustible
        criticos = [v for v in self.vuelos if v[TIPO] == "ATERRIZAJE" and v[COMBUSTIBLE] < 15]
        emergencias = [v for v in criticos if v[COMBUSTIBLE] <= 5]
        criticos_no_emergencia = [v for v in criticos if v[COMBUSTIBLE] > 5]
        
        if criticos:
            self.text_info.insert(tk.END, f"\n⚠️  ESTADO DE COMBUSTIBLE:\n", 'header')
            self.text_info.insert(tk.END, f"  ⚡ Emergencia (≤5 min): {len(emergencias)} vuelos\n", 'emergencia')
            self.text_info.insert(tk.END, f"  ⚠️  Crítico (6-14 min): {len(criticos_no_emergencia)} vuelos\n", 'critico')
            self.text_info.insert(tk.END, f"  ✅ Normal (≥15 min): {aterrizajes - len(criticos)} vuelos\n", 'success')
            
            # Muestra detalles de vuelos en emergencia
            if emergencias:
                self.text_info.insert(tk.END, f"\n⚡ VUELOS EN EMERGENCIA (PRIORIDAD MÁXIMA):\n", 'emergencia')
                # Muestra solo los primeros 5 para no saturar
                for vuelo in emergencias[:5]:
                    estado_emergencia = "EN PISTA" if vuelo[ESTADO] == "EN_PISTA" else "EN COLA"
                    self.text_info.insert(tk.END, f"  {vuelo[ID]}: {vuelo[COMBUSTIBLE]} min - {estado_emergencia}\n", 'emergencia')
        
        # Estadísticas de pistas
        self.text_info.insert(tk.END, f"\n🛬 ESTADÍSTICAS DE PISTAS:\n", 'header')
        pistas_libres = len([p for p in self.pistas if p[PISTA_ESTADO] == "LIBRE" and p[PISTA_HABILITADA] == 1])
        pistas_ocupadas = len([p for p in self.pistas if p[PISTA_ESTADO] == "OCUPADA"])
        pistas_deshabilitadas = len([p for p in self.pistas if p[PISTA_HABILITADA] == 0])
        
        self.text_info.insert(tk.END, f"  🟢 Pistas libres: {pistas_libres}\n", 'pista_libre')
        self.text_info.insert(tk.END, f"  🟡 Pistas ocupadas: {pistas_ocupadas}\n", 'pista_ocupada')
        self.text_info.insert(tk.END, f"  🔴 Pistas deshabilitadas: {pistas_deshabilitadas}\n", 'pista_deshabilitada')
        self.text_info.insert(tk.END, f"  📋 Total de pistas: {len(self.pistas)}\n")
        
        # Resumen final
        self.text_info.insert(tk.END, f"\n📝 RESUMEN:\n", 'header')
        self.text_info.insert(tk.END, f"  • {len(self.pistas)} pistas disponibles\n")
        self.text_info.insert(tk.END, f"  • {len([v for v in self.vuelos if v[ESTADO] == 'EN_COLA'])} vuelos en espera\n")
        self.text_info.insert(tk.END, f"  • {len([v for v in self.vuelos if v[ESTADO] == 'COMPLETADO'])} vuelos completados\n")
        self.text_info.insert(tk.END, f"  • {len([v for v in self.vuelos if v[PRIORIDAD] == 2])} vuelos de emergencia\n")
        self.text_info.insert(tk.END, f"  • {len([v for v in self.vuelos if v[ESTADO] == 'EN_PISTA'])} vuelos en pista\n")
    
    # Método para guardar el estado actual en archivos CSV
    def guardar_estado(self):
        """Guardar el estado actual en archivos CSV"""
        try:
            # Guarda vuelos en archivo CSV
            with open("vuelos_actualizado.csv", "w", encoding="utf-8", newline='') as f:
                writer = csv.writer(f)
                # Escribe encabezado
                writer.writerow(['id_vuelo', 'tipo', 'tiempo', 'prioridad', 'combustible', 'estado'])
                # Escribe cada vuelo
                for vuelo in self.vuelos:
                    writer.writerow(vuelo)
            
            # Guarda pistas (solo datos básicos, no estado dinámico)
            with open("pistas_actualizado.csv", "w", encoding="utf-8", newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['id_pista', 'categoria', 'tiempo_uso', 'habilitada'])
                for pista in self.pistas:
                    writer.writerow([
                        pista[PISTA_ID],
                        pista[PISTA_CATEGORIA],
                        pista[PISTA_TIEMPO_USO],
                        pista[PISTA_HABILITADA]
                    ])
            
            # Muestra mensaje de éxito
            self.text_info.insert(tk.END, f"✅ Estado guardado correctamente\n", 'success')
            self.text_info.insert(tk.END, f"  • vuelos_actualizado.csv\n")
            self.text_info.insert(tk.END, f"  • pistas_actualizado.csv\n")
            
        except Exception as e:
            messagebox.showerror("Error", f"Error al guardar estado: {str(e)}")
    
    # Método para abrir diálogo de carga de archivo
    def cargar_archivo_dialog(self):
        """Diálogo para cargar archivo CSV"""
        # Abre diálogo para seleccionar archivo
        archivo = filedialog.askopenfilename(
            title="Seleccionar archivo CSV",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")]
        )
        
        # Si se seleccionó un archivo
        if archivo:
            try:
                # Detecta tipo de archivo por nombre
                if "vuelo" in archivo.lower():
                    vuelos_cargados = self.cargar_vuelos_desde_csv(archivo)
                    self.text_info.insert(tk.END, f"✅ Vuelos cargados desde: {archivo}\n", 'success')
                    self.actualizar_status()
                elif "pista" in archivo.lower():
                    pistas_cargadas = self.cargar_pistas_desde_csv(archivo)
                    self.text_info.insert(tk.END, f"✅ Pistas cargadas desde: {archivo}\n", 'success')
                    self.actualizar_status()
                else:
                    # Si no se puede detectar por nombre, analiza contenido
                    with open(archivo, 'r', encoding='utf-8') as f:
                        primera_linea = f.readline().lower()
                        if 'vuelo' in primera_linea or 'id_vuelo' in primera_linea:
                            vuelos_cargados = self.cargar_vuelos_desde_csv(archivo)
                            self.text_info.insert(tk.END, f"✅ Vuelos cargados desde: {archivo}\n", 'success')
                        elif 'pista' in primera_linea or 'id_pista' in primera_linea:
                            pistas_cargadas = self.cargar_pistas_desde_csv(archivo)
                            self.text_info.insert(tk.END, f"✅ Pistas cargadas desde: {archivo}\n", 'success')
                        else:
                            messagebox.showwarning("Advertencia", "No se pudo determinar el tipo de archivo")
            except Exception as e:
                messagebox.showerror("Error", f"Error al cargar archivo: {str(e)}")
    
    # Método para iniciar la simulación dinámica
    def iniciar_simulacion(self):
        """Iniciar la simulación dinámica"""
        # Verifica si ya hay simulación activa
        if self.simulacion_activa:
            messagebox.showinfo("Información", "La simulación ya está en curso")
            return
        
        # Verifica si hay vuelos para simular
        if not self.vuelos:
            messagebox.showinfo("Información", "No hay vuelos para simular")
            return
        
        # Activa bandera de simulación
        self.simulacion_activa = True
        # Borra contenido actual
        self.text_info.delete(1.0, tk.END)
        # Muestra mensaje de inicio
        self.text_info.insert(tk.END, "▶️ SIMULACIÓN DINÁMICA INICIADA\n\n", 'title')
        self.text_info.insert(tk.END, f"⏱️  Cada {self.velocidad_var.get()} segundos = 1 minuto simulado\n\n", 'info')
        self.text_info.insert(tk.END, "📋 REGLAS DE SIMULACIÓN CON PISTAS:\n", 'header')
        self.text_info.insert(tk.END, "• Cada pista tiene su propio tiempo_uso (duración de operaciones)\n")
        self.text_info.insert(tk.END, "• Vuelos con combustible ≤5 min tienen PRIORIDAD MÁXIMA\n")
        self.text_info.insert(tk.END, "• Las pistas registran qué vuelo las usa y hasta qué minuto\n")
        self.text_info.insert(tk.END, "• Las pistas pueden estar LIBRE, OCUPADA o DESHABILITADA\n")
        
        # Crea y ejecuta hilo para simulación (evita bloquear interfaz)
        self.hilo_simulacion = threading.Thread(target=self.ejecutar_simulacion, daemon=True)
        self.hilo_simulacion.start()
        
        # Actualiza barra de estado
        self.actualizar_status()
    
    # Método para pausar la simulación
    def pausar_simulacion(self):
        """Pausar la simulación dinámica"""
        # Verifica si la simulación está activa
        if not self.simulacion_activa:
            messagebox.showinfo("Información", "La simulación no está activa")
            return
        
        # Pausa simulación
        self.simulacion_activa = False
        self.text_info.insert(tk.END, "⏸️ SIMULACIÓN PAUSADA\n\n", 'info')
        self.actualizar_status()
    
    # Método para detener completamente la simulación
    def detener_simulacion(self):
        """Detener completamente la simulación"""
        # Detiene simulación
        self.simulacion_activa = False
        self.reloj_simulado = 0  # Reinicia reloj
        
        # Reinicia estados de todas las pistas
        for i in range(len(self.pistas)):
            self.pistas[i] = (
                self.pistas[i][PISTA_ID],
                self.pistas[i][PISTA_CATEGORIA],
                self.pistas[i][PISTA_TIEMPO_USO],
                self.pistas[i][PISTA_HABILITADA],
                "LIBRE",
                None,
                None
            )
        
        # Limpia diccionario de tiempos en pista
        self.tiempo_en_pista.clear()
        
        # Muestra mensaje
        self.text_info.delete(1.0, tk.END)
        self.text_info.insert(tk.END, "⏹️ SIMULACIÓN DETENIDA - Estados reiniciados\n\n", 'info')
        self.actualizar_status()
    
    # Método que ejecuta la simulación en un hilo separado
    def ejecutar_simulacion(self):
        """Ejecutar la simulación dinámica en un hilo separado"""
        # Bucle principal de simulación
        while self.simulacion_activa:
            try:
                # Obtiene velocidad configurada (segundos por minuto simulado)
                velocidad = float(self.velocidad_var.get())
                
                # Ejecuta un minuto de simulación
                self.avanzar_minuto_simulacion()
                
                # Actualiza la interfaz en el hilo principal (tkinter no es thread-safe)
                self.root.after(0, self.mostrar_vuelos)
                
                # Espera según la velocidad configurada
                time.sleep(velocidad)
                
            except Exception as e:
                print(f"Error en simulación: {e}")
                break
    
    # Método que avanza un minuto en la simulación
    def avanzar_minuto_simulacion(self):
        """Avanzar un minuto en la simulación dinámica"""
        # Incrementa reloj simulado
        self.reloj_simulado += 1
        
        # 1. Consumir combustible de vuelos en espera de aterrizaje
        for i, vuelo in enumerate(self.vuelos):
            if vuelo[TIPO] == "ATERRIZAJE" and vuelo[ESTADO] in ["EN_COLA", "ASIGNANDO"]:
                # Reduce combustible en 1 minuto (no menor a 0)
                nuevo_combustible = max(0, vuelo[COMBUSTIBLE] - 1)
                # Determina nueva prioridad según combustible
                nueva_prioridad = vuelo[PRIORIDAD]
                if nuevo_combustible <= 5:
                    nueva_prioridad = 2  # EMERGENCIA - Prioridad máxima
                elif nuevo_combustible <= 15 and nueva_prioridad < 1:
                    nueva_prioridad = 1  # Alta prioridad
                
                # Actualiza vuelo con nuevo combustible y prioridad
                self.vuelos[i] = (vuelo[ID], vuelo[TIPO], vuelo[TIEMPO], 
                                 nueva_prioridad, nuevo_combustible, vuelo[ESTADO])
        
        # 2. Liberar pistas cuyo tiempo ha expirado
        for i, pista in enumerate(self.pistas):
            if pista[PISTA_ESTADO] == "OCUPADA" and pista[PISTA_TIEMPO_FIN] is not None:
                if self.reloj_simulado >= pista[PISTA_TIEMPO_FIN]:
                    # Vuelo que está usando la pista
                    vuelo_id = pista[PISTA_VUELO_ACTUAL]
                    
                    # Marca vuelo como completado
                    for j, vuelo in enumerate(self.vuelos):
                        if vuelo[ID] == vuelo_id:
                            self.vuelos[j] = (vuelo[ID], vuelo[TIPO], vuelo[TIEMPO], 
                                             vuelo[PRIORIDAD], vuelo[COMBUSTIBLE], "COMPLETADO")
                            break
                    
                    # Libera pista (estado LIBRE, sin vuelo)
                    self.pistas[i] = (
                        pista[PISTA_ID],
                        pista[PISTA_CATEGORIA],
                        pista[PISTA_TIEMPO_USO],
                        pista[PISTA_HABILITADA],
                        "LIBRE",
                        None,
                        None
                    )
                    
                    # Elimina del registro de tiempos
                    if vuelo_id in self.tiempo_en_pista:
                        del self.tiempo_en_pista[vuelo_id]
                    
                    # Muestra mensaje en interfaz
                    self.root.after(0, lambda vid=vuelo_id: 
                                   self.text_info.insert(tk.END, 
                                   f"✅ Vuelo {vid} completó operación en pista\n", 'success'))
        
        # 3. Asignar vuelos a pistas libres (PRIORIDAD: EMERGENCIA primero)
        pistas_libres = [p for p in self.pistas if p[PISTA_ESTADO] == "LIBRE" and p[PISTA_HABILITADA] == 1]
        
        for pista in pistas_libres:
            # Busca vuelos en cola
            vuelos_en_cola = [v for v in self.vuelos if v[ESTADO] == "EN_COLA"]
            if not vuelos_en_cola:
                break
            
            # PRIORIDAD 1: Vuelos con combustible ≤5 minutos (EMERGENCIA)
            emergencias = [v for v in vuelos_en_cola if v[COMBUSTIBLE] <= 5]
            
            if emergencias:
                # Ordena emergencias por combustible (menos combustible primero)
                emergencias.sort(key=lambda x: (x[COMBUSTIBLE], x[TIEMPO]))
                vuelo_a_asignar = emergencias[0]
            else:
                # PRIORIDAD 2: Otros vuelos por prioridad normal
                vuelos_en_cola.sort(key=lambda x: (-x[PRIORIDAD], 
                                                  x[COMBUSTIBLE] if x[TIPO] == "ATERRIZAJE" else 999,
                                                  x[TIEMPO]))
                vuelo_a_asignar = vuelos_en_cola[0]
            
            # Verifica compatibilidad de pista con vuelo
            if self.pista_es_compatible(pista, vuelo_a_asignar):
                # Cambia estado del vuelo a ASIGNANDO (intermedio)
                for i, v in enumerate(self.vuelos):
                    if v[ID] == vuelo_a_asignar[ID]:
                        self.vuelos[i] = (v[ID], v[TIPO], v[TIEMPO], 
                                         v[PRIORIDAD], v[COMBUSTIBLE], "ASIGNANDO")
                        break
                
                # Calcula minuto en que terminará el uso de la pista
                tiempo_fin = self.reloj_simulado + pista[PISTA_TIEMPO_USO]
                
                # Ocupa la pista
                pista_index = self.pistas.index(pista)
                self.pistas[pista_index] = (
                    pista[PISTA_ID],
                    pista[PISTA_CATEGORIA],
                    pista[PISTA_TIEMPO_USO],
                    pista[PISTA_HABILITADA],
                    "OCUPADA",
                    vuelo_a_asignar[ID],
                    tiempo_fin
                )
                
                # Registra tiempo en pista
                self.tiempo_en_pista[vuelo_a_asignar[ID]] = pista[PISTA_TIEMPO_USO]
                
                # Programa cambio a EN_PISTA después de 1 segundo (simula 1 minuto de asignación)
                self.root.after(1000, lambda vid=vuelo_a_asignar[ID]: 
                               self.cambiar_a_en_pista(vid))
                
                # Muestra mensaje de asignación
                self.root.after(0, lambda vid=vuelo_a_asignar[ID], pid=pista[PISTA_ID]: 
                               self.text_info.insert(tk.END, 
                               f"🛬 Vuelo {vid} asignado a pista {pid} hasta minuto {tiempo_fin}\n", 'info'))
    
    # Método para cambiar estado de vuelo de ASIGNANDO a EN_PISTA
    def cambiar_a_en_pista(self, vuelo_id):
        """Cambia el estado de un vuelo de ASIGNANDO a EN_PISTA"""
        # Busca el vuelo y cambia su estado
        for i, vuelo in enumerate(self.vuelos):
            if vuelo[ID] == vuelo_id and vuelo[ESTADO] == "ASIGNANDO":
                self.vuelos[i] = (vuelo[ID], vuelo[TIPO], vuelo[TIEMPO], 
                                 vuelo[PRIORIDAD], vuelo[COMBUSTIBLE], "EN_PISTA")
                break
    
    # Método para verificar compatibilidad entre pista y vuelo
    def pista_es_compatible(self, pista, vuelo):
        """Verifica si una pista es compatible con un tipo de vuelo"""
        # Pista deshabilitada no es compatible con ningún vuelo
        if pista[PISTA_HABILITADA] == 0:
            return False
            
        categoria = pista[PISTA_CATEGORIA]
        
        # Reglas de compatibilidad según tipo de vuelo
        if vuelo[TIPO] == "DESPEGUE":
            # Despegues requieren pistas estándar o largas
            return categoria in ["estandar", "larga"]
        elif vuelo[TIPO] == "ATERRIZAJE":
            if vuelo[PRIORIDAD] == 2:  # Emergencia
                # Emergencias requieren pistas largas o estándar
                return categoria in ["larga", "estandar"]
            else:
                # Aterrizajes normales pueden usar cualquier pista
                return True
        return False
    
    # Método para limpiar todos los datos
    def limpiar_datos(self):
        """Limpiar todos los datos"""
        # Pide confirmación al usuario
        if messagebox.askyesno("Confirmar", "¿Está seguro de limpiar todos los datos? Esta acción no se puede deshacer."):
            # Detiene simulación si está activa
            self.simulacion_activa = False
            self.reloj_simulado = 0
            
            # Limpia todas las listas y diccionarios
            self.vuelos = []
            self.pistas = []
            self.tiempo_en_pista.clear()
            self.text_info.delete(1.0, tk.END)
            self.text_info.insert(tk.END, "🗑️ Todos los datos han sido eliminados\n", 'info')
            self.actualizar_status()
    
    # Método para mostrar ayuda del sistema
    def mostrar_ayuda(self):
        """Mostrar ayuda del sistema"""
        # Borra contenido actual
        self.text_info.delete(1.0, tk.END)
        # Inserta título de ayuda
        self.text_info.insert(tk.END, "❓ AYUDA DEL SISTEMA - GESTIÓN DE PISTAS\n\n", 'title')
        
        # Texto de ayuda explicativo
        ayuda_texto = """
✈️ SISTEMA DE GESTIÓN DE VUELOS - PISTAS ESPECÍFICAS

🛬 PISTAS CARGADAS DESDE CSV:
   • R1: categoría LARGA, tiempo_uso 3 minutos, HABILITADA
   • R2: categoría ESTÁNDAR, tiempo_uso 3 minutos, HABILITADA

⚙️ REGLAS DE COMPATIBILIDAD:
   • Pista R1 (LARGA): Acepta TODOS los tipos de vuelos
     - Aterrizajes normales y de emergencia
     - Despegues
   
   • Pista R2 (ESTÁNDAR): Acepta:
     - Despegues (todos)
     - Aterrizajes normales
     - Aterrizajes de EMERGENCIA (combustible ≤5 min)

⏱️ TIEMPO DE USO:
   • Ambas pistas: 3 minutos por operación
   • Los vuelos ocupan la pista exactamente 3 minutos
   • El sistema calcula automáticamente el minuto de liberación

⚠️ PRIORIDADES:
   1. Vuelos con combustible ≤5 min (EMERGENCIA)
   2. Vuelos con prioridad alta (1)
   3. Vuelos con prioridad normal (0)

📊 CONTROL DE PISTAS:
   • Estado LIBRE: Disponible para asignación
   • Estado OCUPADA: En uso por un vuelo
   • Estado DESHABILITADA: No disponible

🔧 GESTIÓN MANUAL DE PISTAS:
   • Puede agregar nuevas pistas
   • Habilitar/deshabilitar pistas existentes
   • Liberar pistas ocupadas (emergencia)

🎯 OBJETIVO DEL SISTEMA:
   • Gestionar eficientemente 2 pistas (R1 y R2)
   • Priorizar vuelos de emergencia
   • Maximizar uso de pistas
   • Minimizar tiempo de espera
        """
        
        # Inserta texto de ayuda
        self.text_info.insert(tk.END, ayuda_texto)
    
    # Método para salir de la aplicación
    def salir(self):
        """Salir de la aplicación"""
        # Pide confirmación al usuario
        if messagebox.askyesno("Salir", "¿Desea salir del sistema?"):
            # Detiene simulación si está activa
            self.simulacion_activa = False
            
            # Espera a que el hilo termine (timeout de 1 segundo)
            if self.hilo_simulacion and self.hilo_simulacion.is_alive():
                self.hilo_simulacion.join(timeout=1)
            
            # Intenta guardar estado automáticamente
            try:
                self.guardar_estado()
            except:
                pass  # Si falla, no impide la salida
            
            # Cierra la aplicación
            self.root.quit()
            self.root.destroy()

# Función principal que inicia la aplicación
def main():
    """Función principal"""
    # Crea ventana principal de tkinter
    root = tk.Tk()
    # Crea instancia de la aplicación
    app = SistemaVuelosGUI(root)
    # Inicia el loop principal de tkinter
    root.mainloop()

# Punto de entrada del programa
if __name__ == "__main__":
    main()  # Ejecuta la función main