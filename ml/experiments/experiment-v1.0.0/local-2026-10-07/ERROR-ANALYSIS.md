# Análisis de errores — predicciones observadas

Datos sintéticos; no información institucional real.

Candidato: `linear-svc-c1`. Desarrollo OOF: 139/160 aciertos, 21 fallos. Prueba final: 40/40 aciertos, 0 fallos.

OOF significa que cada predicción de desarrollo proviene de un modelo que no vio ese grupo durante su ajuste. No se utiliza el modelo ajustado con todo desarrollo para medir aciertos sobre esos mismos textos.

## Distribución de fallos de desarrollo

| Categoría real | Errores |
| --- | ---: |
| SOPORTE | 3 |
| REDES | 3 |
| INFRAESTRUCTURA | 3 |
| BIOMEDICO | 12 |

## Ejemplos de errores observados

### ML-0022: SOPORTE → REDES

**Teclado externo sin respuesta**. El teclado USB no registra pulsaciones en varias aplicaciones. El puntero del mouse funciona y la estación responde; otro teclado de prueba sí permite escribir.

Criterio de etiqueta esperado (solo para revisión, nunca input del clasificador): Se trata de un periférico general de una estación de trabajo.

### ML-0044: SOPORTE → REDES

**Un perfil del navegador no permite abrir el formulario**. El formulario de demostración no se muestra en el navegador que uso normalmente y aparece un aviso sobre datos del sitio. Probé la misma página en otro navegador del mismo puesto y funcionó, sin cambiar la conexión. Otros sitios también abren. Necesito revisar la configuración del perfil para recuperar esa aplicación de usuario.

Criterio de etiqueta esperado (solo para revisión, nunca input del clasificador): El error está acotado al perfil o configuración de un navegador, con acceso comprobado desde otro navegador.

### ML-0062: REDES → SOPORTE

**Tramo de datos con continuidad intermitente**. La comprobación del cableado muestra pérdida de continuidad en el tramo que une el puesto al panel. La estación y el puerto funcionan con un tramo de prueba.

Criterio de etiqueta esperado (solo para revisión, nunca input del clasificador): La falla es continuidad del cable de comunicaciones; no es suministro eléctrico ni hardware local.

### ML-0102: INFRAESTRUCTURA → BIOMEDICO

**UPS sin autonomía durante comprobación programada**. El respaldo indica carga de batería, pero no sostiene su carga conectada durante la comprobación autorizada de autonomía. El fallo afecta alimentación, no enlace de datos.

Criterio de etiqueta esperado (solo para revisión, nunca input del clasificador): El problema es continuidad del suministro eléctrico del respaldo, aunque afecte equipos de comunicaciones.

### ML-0120: INFRAESTRUCTURA → BIOMEDICO

**Toma electrica floja**. Punto de bancada con fijación rota, no se usa. No es puerto LAN ni falla interna del PC.

Criterio de etiqueta esperado (solo para revisión, nunca input del clasificador): Se reporta daño o falta de suministro en un punto eléctrico del ambiente, no avería interna de la estación.

### ML-0145: INFRAESTRUCTURA → BIOMEDICO

**PDU banco sin energia**. Entrada con indicador activo, salidas de un banco sin suministro. No son puertos LAN.

Criterio de etiqueta esperado (solo para revisión, nunca input del clasificador): El problema está en la distribución de energía del gabinete, no en puertos de datos de un switch.

### ML-0151: BIOMEDICO → SOPORTE

**El monitor de signos no reconoce el sensor**. En la comprobación con simulador el monitor muestra sensor no conectado aunque el accesorio está colocado. La pantalla enciende; se solicita evaluación del equipo sin uso en personas.

Criterio de etiqueta esperado (solo para revisión, nunca input del clasificador): Falla un sensor específico de un monitor de signos; no se describe pantalla de una PC ni pérdida de LAN.

### ML-0161: BIOMEDICO → REDES

**El electrocardiógrafo deja canales sin señal**. Con el simulador de banco el electrocardiógrafo marca varios canales desconectados. El equipo inicia, pero no completa la adquisición de prueba.

Criterio de etiqueta esperado (solo para revisión, nunca input del clasificador): Falla la detección de canales de adquisición del electrocardiógrafo durante prueba técnica.

## Aciertos observados de desarrollo

- ML-0011 — La computadora vuelve a reiniciarse al entrar: real=SOPORTE, predicción=SOPORTE.
- ML-0051 — No aparece la red inalámbrica de prueba: real=REDES, predicción=REDES.
- ML-0101 — La UPS no mantiene encendidos los equipos: real=INFRAESTRUCTURA, predicción=INFRAESTRUCTURA.
- ML-0152 — Canal de sensor biomédico no detectado: real=BIOMEDICO, predicción=BIOMEDICO.

## Interpretación para revisar

Las confusiones pueden reflejar vocabulario compartido (monitor, señal, cable, software, energía) y familias ausentes en el entrenamiento de un fold. Un vectorizador TF-IDF no comprende de forma fiable negaciones ni cuál es el componente afectado. Son hipótesis de revisión de los textos, no diagnósticos ni explicaciones causales demostradas de los pesos del modelo.

El resultado final perfecto no elimina los fallos OOF. Solo hay ocho grupos finales y un corpus sintético de una fuente asistida, sin revisión humana independiente. No añadir errores artificiales ni escoger otra prueba para bajar/subir métricas. Cualquier mejora posterior requiere una versión nueva y una evaluación declarada; no usar estos errores para retocar V1.

Los scores SVM son márgenes, incluso pueden ser negativos. No convertirlos a porcentaje ni interpretarlos como certeza. La política de abstención/umbral operativo queda pendiente de validación con desarrollo antes de integración. Este postprocesamiento no entrena, cambia la decisión ni exporta modelos.
