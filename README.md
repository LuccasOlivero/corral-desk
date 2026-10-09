# Corral

Corral es una aplicación de escritorio local para la gestión de notas y documentos personales, construida con Tauri y React. Su diseño está inspirado en Notion, con una interfaz minimalista, organización jerárquica de páginas y soporte completo para formato de texto enriquecido, todo respaldado por una base de datos local rápida y segura en SQLite.

## Especificaciones y Stack Tecnológico

- **Frontend:** React 19, TypeScript, Vite.
- **Editor:** Tiptap (con soporte para tareas, bloques de código, imágenes y drag-and-drop).
- **Gestión de Estado:** Zustand (optimizado con selectores atómicos y code-splitting).
- **Backend / Desktop:** Tauri v2 (Rust).
- **Base de Datos:** SQLite (modo `WAL` para alta concurrencia).
- **Estilos:** CSS modular puro con variables CSS y tipografías auto-alojadas (Inter, Archivo, JetBrains Mono).

## Instalación Local

Para ejecutar y compilar este proyecto en tu máquina local, necesitarás tener instalados **Node.js** y **Rust**.

1. **Clonar el repositorio:**
   ```bash
   git clone <url-del-repositorio>
   cd corral
   ```

2. **Instalar dependencias de Node:**
   ```bash
   npm install
   ```

3. **Ejecutar en modo desarrollo:**
   Esto iniciará el servidor de desarrollo de Vite y abrirá la ventana de la aplicación de Tauri.
   ```bash
   npm run tauri dev
   ```

4. **Compilar para producción:**
   Esto generará un instalador o ejecutable para tu sistema operativo dentro de `src-tauri/target/release/bundle`.
   ```bash
   npm run tauri build
   ```

## Servidor MCP (Model Context Protocol)

Corral incluye un servidor MCP (escrito en Python) que permite a otros agentes de inteligencia artificial interactuar de manera segura con tu base de datos de notas. Un agente de código o de chat puede usar las herramientas de este servidor para listar, leer, crear, actualizar y buscar páginas de tu Corral.

### Configuración del MCP

1. Asegúrate de tener **Python 3** instalado en tu sistema.
2. Instala la dependencia oficial del protocolo en Python:
   ```bash
   pip install mcp
   ```
3. El archivo de base de datos de tu aplicación normalmente se creará en una ruta específica dependiendo de tu sistema operativo cuando ejecutes la app por primera vez (por ejemplo, `%APPDATA%\com.luccas.corral\corral.db` en Windows).
4. Configura el cliente MCP apuntando al archivo `server.py` que se encuentra en la carpeta `mcp-server` del proyecto, pasándole como argumento la ruta absoluta a tu base de datos `corral.db`.

Ejemplo de configuración JSON para un cliente de MCP:
```json
{
  "mcpServers": {
    "corral-mcp": {
      "command": "python",
      "args": [
        "C:/Ruta/Absoluta/A/corral/mcp-server/server.py",
        "C:/Ruta/Absoluta/A/AppData/Roaming/com.luccas.corral/corral.db"
      ]
    }
  }
}
```

### Herramientas Disponibles (Tools)

- `corral_list_pages`: Enumera todas las páginas y sus metadatos.
- `corral_read_page`: Lee el título y el contenido completo de una página específica por su ID.
- `corral_create_page`: Crea una nueva página en el entorno local.
- `corral_update_page`: Actualiza el título, contenido o propiedades de una página existente.
- `corral_search`: Busca texto completo en todas las notas de Corral usando SQLite FTS.
