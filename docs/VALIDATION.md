# Validación de entrega — subetapa 1.1

Comprobaciones ejecutadas en el entorno de trabajo Windows de esta entrega:

| Comprobación | Resultado |
| --- | --- |
| Node.js disponible | v24.18.0 |
| Git disponible | 2.55.0.windows.2 |
| Metadatos y sintaxis de los tres scripts Node | Correctos |
| Generación local de `.env` | Correcta; dos claves independientes de 256 bits |
| Segunda ejecución del generador | Conserva el archivo existente; hash sin cambios |
| Exclusión de `.env` por Git | Correcta |
| `git diff --cached --check` | Sin errores |
| Manejo de Docker ausente en `infra:check` | Mensaje explícito y salida 1, según lo esperado |
| Validación de Compose con Docker | Pendiente: Docker no está instalado/disponible |
| Arranque de PostgreSQL y Redis | Pendiente: requiere Docker |
| Ejecución de SQL y pruebas de autenticación | Pendiente: requiere los contenedores |
| Repositorio remoto y ejecución GitHub Actions | Pendientes: GitHub CLI no está disponible; no hay remoto configurado |
| Aplicación cloud y HTTPS | Corresponde a 1.6; no desplegados |

Las verificaciones estáticas no prueban el funcionamiento de los contenedores. El workflow incluido realizará la comprobación de integración una vez publicado y ejecutado en GitHub. Para cerrar 1.1, completar los criterios de [ROADMAP.md](ROADMAP.md).

El ZIP de entrega se genera desde los archivos del commit y excluye `.env` y `.git`. Al extraerlo, ejecutar `npm run env:init` y los pasos Git de [GITHUB.md](GITHUB.md).
