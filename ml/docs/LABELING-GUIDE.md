# Guía de etiquetado V1 — clasificación de incidencias

Estado: regla académica propuesta para Dataset V1; no taxonomía oficial de EsSalud. Fuente de nombres: `apps/api/src/domain/ticket.ts`, constante `CATEGORIES`. Solo cuatro etiquetas: `SOPORTE`, `REDES`, `INFRAESTRUCTURA`, `BIOMEDICO`.

## Procedimiento del revisor

Leer título y descripción como una única solicitud. Identificar qué componente falla y qué evidencia permite distinguir el ámbito. Elegir una sola categoría por el problema principal descrito, sin inferir una causa no indicada. Guardar una justificación corta fuera del texto que aprenderá el modelo.

Si faltan detalles para distinguir categorías, marcar `PENDING_REVIEW` y excluir del conjunto aprobado hasta aclarar. No resolverlo mediante una prioridad arbitraria entre categorías. Si hay dos incidentes independientes, dividirlos o excluir; no crear una etiqueta MIXTO. Un segundo revisor debe revisar los casos fronterizos; si no está disponible, registrar esa limitación en la Dataset Card. Cambios de criterio requieren versión de la guía y revisión de etiquetas afectadas.

## SOPORTE

Atención del puesto de trabajo, sistema operativo, aplicaciones de usuario, cuenta local o de aplicación y periféricos de uso general. Incluir fallos de aplicación descritos con suficiente evidencia aunque ocurran en varias estaciones. No atribuir toda avería masiva a la red.

Ejemplos ilustrativos: aplicación de oficina no abre; teclado no responde; impresora USB deja papel atascado; contraseña de una aplicación rechazada mientras otros servicios funcionan. Estos ejemplos explican las reglas; no son registros de Dataset V1.

Excluir fallos confirmados de conectividad (REDES), suministro/ambiente físico (INFRAESTRUCTURA) y funcionamiento específico de equipos médicos (BIOMEDICO).

## REDES

Transporte y acceso a datos: LAN, Wi-Fi, switches, enlaces, direccionamiento, DNS, DHCP, VLAN y cableado de comunicaciones. El texto debe describir evidencia de conectividad, no solamente que una página o aplicación falló.

Ejemplos: varias estaciones no reciben dirección IP; puerto de switch no establece enlace con cable comprobado; red inalámbrica no aparece; impresora compartida inaccesible por IP mientras imprime localmente.

Excluir avería de aplicación con conexión comprobada (SOPORTE), energía o refrigeración de equipos de red (INFRAESTRUCTURA), y módulo interno defectuoso de un equipo médico sin evidencia de fallo general de red (BIOMEDICO).

## INFRAESTRUCTURA

Soporte físico y ambiental de TI: alimentación eléctrica, UPS, respaldo energético, tomacorrientes, regletas, puesta a tierra, gabinetes/racks, ventilación y refrigeración de sala técnica. No significa toda avería de hardware ni toda obra civil del hospital.

Ejemplos: UPS no mantiene alimentación durante un corte; aire acondicionado de la sala técnica detenido; rack con soporte físico deteriorado. Un cable de datos con fallo de enlace se clasifica REDES, aunque sea físico.

Excluir disco/teclado de una estación (SOPORTE), configuración de switch o enlace (REDES), y funcionamiento/calibración de un equipo médico (BIOMEDICO). No ofrecer instrucciones eléctricas de reparación.

## BIOMEDICO

Funcionamiento, sensores, accesorios específicos, calibración o software dedicado de equipos médicos y biomédicos. La descripción debe centrarse en el dispositivo médico, sin incluir información de pacientes ni juicio clínico.

Ejemplos: sensor de monitor de signos no reconocido; bomba de infusión indica fallo del mecanismo; equipo de laboratorio no completa su autoprueba. Se describe una incidencia técnica ficticia, sin recomendar uso ni reparación clínica.

Excluir un fallo de LAN compartido por múltiples dispositivos (REDES), energía del ambiente/UPS (INFRAESTRUCTURA), y una aplicación administrativa de oficina utilizada en un área médica (SOPORTE). Estar en un área clínica no convierte automáticamente el ticket en biomédico.

## Casos fronterizos y decisión

| Texto o evidencia disponible | Decisión | Razón |
| --- | --- | --- |
| Impresora USB atasca papel | SOPORTE | Periférico general, sin fallo de enlace |
| Impresora imprime prueba local pero no responde por IP | REDES | Evidencia de conectividad |
| Aplicación muestra error propio; conexión y otras aplicaciones funcionan | SOPORTE | Fallo de aplicación descrito |
| Ningún equipo obtiene IP después de un cambio de DHCP | REDES | Servicio de red identificado |
| Solo dice «no funciona el sistema» | PENDING_REVIEW | Información insuficiente; no es una clase entrenable |
| Switch se apaga porque la UPS no entrega energía | INFRAESTRUCTURA | Problema descrito del suministro |
| Switch con energía pero puerto sin enlace | REDES | Enlace de comunicaciones |
| Computadora tiene disco local no reconocido | SOPORTE | Hardware del puesto, no soporte ambiental |
| Monitor médico falla en autoprueba de sensor | BIOMEDICO | Función propia del equipo médico |
| Equipos médicos y estaciones pierden simultáneamente LAN | REDES | Problema común de comunicaciones |
| Módulo de comunicaciones interno del equipo médico reporta fallo propio; LAN comprobada | BIOMEDICO | Avería específica del dispositivo |
| Aire acondicionado de sala técnica detenido | INFRAESTRUCTURA | Ambiente de infraestructura TI |
| Archivo de oficina no abre en un consultorio | SOPORTE | La ubicación no determina categoría |
| UPS falla y además teclado roto sin relación | Separar/excluir | Dos averías independientes |

## Reglas de construcción y revisión

- No añadir prefijos «incidencia de redes» ni la etiqueta como pista artificial. Nombres naturales de dispositivos y síntomas sí son válidos.
- No incorporar una solución posterior, categoría histórica o conclusión de un técnico que no existiría al reportar.
- Mantener consistencia entre título y descripción. Los errores ortográficos no deben cambiar el significado necesario para etiquetar.
- Variantes de la misma avería pertenecen al mismo grupo de fuga. Cambiar una sede ficticia no crea una familia independiente.
- Marcar `is_synthetic: true` y origen `SYNTHETIC / DEMO / ACADEMIC DATASET` en metadatos, sin introducirlo como característica predictiva.
- Registrar desacuerdos y motivos; revisar etiquetas antes de congelar particiones. Ningún ejemplo pendiente entra en entrenamiento ni prueba final.

En la aplicación futura, la ambigüedad se manejará sin sugerencia obligatoria y con selección manual, conservando las cuatro categorías operativas existentes.
