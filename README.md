# 🏖️ Casa Familiar Chipiona - Web de Reservas

Aplicación web diseñada con enfoque **Mobile-First** (optimizada al 100% para teléfonos móviles) para organizar de forma sencilla las reservas familiares de la casa en Chipiona, evitando confusiones y solapamientos en los grupos de WhatsApp.

---

## ✨ Características Principales

1. **Página de Inicio Familiar:**
   - Visualización de bienvenida con ambiente de Chipiona.
   - Indicador en tiempo real de **¿Quién está hoy en la casa?** (o si está libre).
   - Botón directo para **Ver Calendario** y botón destacado para **Añadir Reserva**.
   - Lista de las próximas visitas familiares.
   - Acceso rápido: información de habitaciones, normas y consejos editables con lápiz.

2. **Añadir Reserva (Estilo Web de Hotel):**
   - Selector interactivo de rango de fechas (Fecha de Entrada y Fecha de Salida) con calendario visual integrado.
   - Cálculo automático del número de noches.
   - Nombre de quien reserva.
   - Selector táctil de **1, 2 o 3 habitaciones** (la casa tiene 3 en total).
   - Alerta en tiempo real si para esas fechas ya no quedan suficientes habitaciones libres.
   - Campo para notas y comentarios (hora estimada de llegada, quiénes vienen, etc.).

3. **Calendario Mensual Interactivo:**
   - Navegación mes a mes con botones anterior/siguiente y botón "Hoy".
   - Cada día muestra las etiquetas con el **nombre de la persona** y las habitaciones ocupadas.
   - Código de colores visual:
     - 🟢 **Verde:** Libre.
     - 🟠 **Ámbar:** Parcialmente ocupada (1 o 2 habitaciones).
     - 🔴 **Rojo:** Completa (3 habitaciones).
   - Al tocar cualquier día con reserva se abre la ficha con la información completa.
   - Al tocar un día libre, te abre directamente el formulario de reserva con esa fecha seleccionada.

4. **Ficha Completa de la Reserva y Cancelación:**
   - Nombre de quien reservó.
   - Fechas exactas de entrada y salida formateadas con día de la semana.
   - Número de noches y habitaciones reservadas.
   - Comentarios y notas.
   - **Botón "Cancelar reserva"** con confirmación de seguridad para liberar las fechas inmediatamente.

5. **Diseño Mobile-First (Para usar en el móvil):**
   - Barra de navegación inferior táctil (*Bottom Navigation Bar*) estilo Airbnb / Booking.
   - Despliegue de ventanas y modales optimizados para pantallas táctiles.
   - Soporte para pantalla completa y agregar a la pantalla de inicio del móvil como una aplicación (PWA).

---

## 🚀 Cómo ponerla en marcha

### Opción 1: En tu red local (Para usar ya en casa con el móvil)

1. Abre una terminal en la carpeta del proyecto:
   ```bash
   npm start
   ```
2. La terminal mostrará las direcciones de acceso:
   ```
   ======================================================
   🏖️  CASA FAMILIAR CHIPIONA - WEB DE RESERVAS
   ======================================================
   💻 En este ordenador:   http://localhost:3000
   📱 En el MÓVIL (misma Wi-Fi familiar):
      👉 http://192.168.x.x:3000
   ======================================================
   ```
3. Cualquier miembro de la familia conectado a la misma red Wi-Fi puede abrir la dirección del móvil (`http://192.168.x.x:3000`) desde Safari o Chrome.

---

### Opción 2: Publicarla en Internet gratis para toda la familia

Para que cualquier familiar pueda reservar desde cualquier sitio mediante un enlace en WhatsApp sin necesidad de estar en la misma red Wi-Fi:

1. **Base de Datos Cloud en Supabase (Recomendado):**
   - El proyecto ya está configurado con Supabase.
   - Si creas un nuevo proyecto o necesitas regenerar las tablas, ejecuta en el **SQL Editor** de Supabase el script [`supabase.sql`](supabase.sql).
   - Variables de entorno (`.env`):
     ```env
     SUPABASE_URL=https://ktvytchrrowvvwlglreo.supabase.co
     SUPABASE_KEY=sb_publishable_of7Wn9ExHHD5RyrWu-M7og_nId7gtm6
     ```

2. **Vercel / Render.com / Railway:**
   - Sube esta carpeta a GitHub y conéctala a Vercel o Render.
   - Añade las variables de entorno `SUPABASE_URL` y `SUPABASE_KEY`.
   - Vercel despliega automáticamente la API en `/api/*` y la web estática.

3. **Modo Estático / GitHub Pages:**
   - La web se conecta directamente a Supabase Cloud desde el navegador (`StorageService`), sincronizando todas las reservas entre todos los dispositivos en tiempo real sin requerir backend propio.

---

## 📱 Cómo añadir la web como una App en el Móvil

Para que los familiares tengan un icono directo en el escritorio de su móvil:

- **En iPhone (Safari):**
  1. Abre el enlace de la web en Safari.
  2. Pulsa el botón de **Compartir** (el icono de un cuadrado con flecha hacia arriba).
  3. Selecciona **"Añadir a la pantalla de inicio"**.

- **En Android (Google Chrome):**
  1. Abre el enlace en Chrome.
  2. Pulsa los **3 puntos** de la esquina superior derecha.
  3. Selecciona **"Añadir a la pantalla de inicio"** o **"Instalar aplicación"**.

---

## 📁 Estructura del Proyecto

```
Web Chipiona/
│
├── index.html         # Página principal y estructura de vistas/modales móviles
├── server.js          # Servidor Node.js Express con API REST
├── package.json       # Dependencias y scripts de ejecución
├── README.md          # Documentación de uso y despliegue
│
├── css/
│   └── styles.css     # Estilos personalizados, animaciones y adaptación móvil
│
├── js/
│   ├── app.js         # Lógica del calendario, navegación móvil y modales
│   └── storage.js     # Capa de datos con sincronización API y LocalStorage
│
└── data/
    └── reservas.json  # Base de datos local persistente en formato JSON
```
