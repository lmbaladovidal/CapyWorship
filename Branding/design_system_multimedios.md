# DESIGN SYSTEM & UI BRANDING GUIDELINES: MULTIMEDIOS

> **System Context / Agent Instructions:** Actúa como un Senior Frontend Engineer y UI/UX Designer. Utiliza estrictamente los tokens, reglas de contraste, jerarquías tipográficas y especificaciones de componentes definidos en este documento para generar interfaces web o móviles pertenecientes a la marca **MULTIMEDIOS** (*"Creatividad en Sintonía"* / *"Conectando Historias"*). No inventes colores fuera de esta paleta ni modifiques las proporciones de la mascota.

---

## 1. Identidad de Marca y Uso de Activos

* **Nombre de la Marca:** MULTIMEDIOS
* **Taglines Oficiales:**
  * Primario: *"Creatividad en Sintonía"*
  * Secundario: *"Conectando Historias"*
* **Mascota / Isotipo:** Carpincho estilizado con gafas de sol oscuras y auriculares supraaurales (estilo ilustración vectorial con contorno grueso oscuro `#121926`).
* **Reglas de Implementación en UI:**
  * **Navbar / Header:** Usar versión horizontal (Isotipo circular a la izquierda + Wordmark `MULTIMEDIOS` en mayúsculas a la derecha). Altura recomendada: `36px` a `44px`.
  * **Favicon / App Icon / Avatar:** Usar exclusivamente el isotipo circular del carpincho con fondo naranja (`#FF7A00`) y aro exterior azul marino (`#1A2B4C`).
  * **Estados Vacíos (Empty States) / Onboarding:** Utilizar las variantes de cuerpo completo o medio cuerpo de la mascota (ej. carpincho con micrófono o burbuja de diálogo).

---

## 2. Design Tokens (Paleta de Colores)

Implementa estos valores como variables CSS (`:root`) o configuración de tema en Tailwind CSS:

```css
:root {
  /* Brand Primary & Surfaces */
  --color-brand-navy: #1A2B4C;        /* Fondos oscuros, headers, texto principal sobre claro */
  --color-brand-navy-dark: #121E36;   /* Hover en elementos oscuros, bordes de ilustración */
  --color-brand-orange: #FF7A00;      /* CTA principal, acentos activos, fondo de isotipo */
  --color-brand-orange-hover: #E06900;/* Estado hover de botones primarios */
  --color-brand-amber: #FFAE42;       /* Highlights, badges, indicadores secundarios */

  /* Neutrals & UI Surfaces */
  --color-bg-light: #F4F6F9;          /* Fondo principal de aplicación (Light Mode) */
  --color-surface-white: #FFFFFF;     /* Tarjetas (Cards), modales, inputs */
  --color-text-muted: #6C7A89;        /* Subtítulos, placeholders, iconos inactivos */
  --color-border-subtle: #D8E0E8;     /* Divisores, bordes de tarjetas e inputs */
  --color-disabled-bg: #E2E8F0;       /* Fondo de botones deshabilitados */
  --color-disabled-text: #94A3B8;     /* Texto de botones deshabilitados */
}
```

### Reglas de Accesibilidad y Contraste (WCAG AA)
* **Sobre `#1A2B4C` (Navy):** Usar texto en `#FFFFFF` o `#FFAE42`. Nunca usar `#6C7A89` para texto crítico sobre fondo oscuro.
* **Sobre `#FF7A00` (Orange):** Para botones grandes/bold (`>= 18px` o `14px bold`), usar `#FFFFFF` o `#1A2B4C`. Para texto pequeño (`< 14px`), priorizar `#1A2B4C` para garantizar máximo contraste.
* **Sobre `#FFFFFF` / `#F4F6F9`:** Usar `#1A2B4C` para títulos y cuerpo principal, y `#6C7A89` únicamente para metadatos o captions.

---

## 3. Tipografía y Escala Jerárquica

El sistema utiliza una familia **Sans-Serif geométrica/moderna** con excelente legibilidad en pantalla y trazos limpios para encabezados en mayúsculas.

* **Stack recomendado:** `'Plus Jakarta Sans', 'Montserrat', 'Inter', system-ui, sans-serif`
* **Wordmark (Logotipo texto):** Tracking amplio (`letter-spacing: 0.08em`), peso `700 (Bold)`, siempre en `UPPERCASE`.

| Token / Nivel | Tamaño (Desktop / Mobile) | Peso (`font-weight`) | Line Height | Letter Spacing | Uso en UI |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`H1` (Display)** | `32px` / `26px` | `700` (Bold) | `1.2` | `-0.02em` | Títulos de vista principal / Hero |
| **`H2` (Section)** | `24px` / `20px` | `700` (Bold) | `1.3` | `-0.01em` | Encabezados de sección o modal |
| **`H3` (Card Title)** | `18px` / `16px` | `600` (SemiBold) | `1.4` | `0em` | Títulos dentro de tarjetas |
| **`Body` (Default)** | `16px` / `15px` | `400` (Regular) | `1.5` | `0em` | Párrafos, descripciones, contenido general |
| **`UI Label / Btn`** | `14px` | `600` (SemiBold) | `1.0` | `0.02em` | Texto de botones, tabs, navegación |
| **`Caption`** | `12px` | `500` (Medium) | `1.4` | `0.01em` | Fechas, tags, mensajes de ayuda |

---

## 4. Especificaciones de Componentes UI

### A. Botones (Buttons)
* **Geometría:** `border-radius: 8px` (estándar) o `9999px` (pill, opcional para filtros/tags). Padding: `10px 20px`.
* **Variante Primaria (CTA):**
  * Default: `bg: #FF7A00`, `text: #FFFFFF`, `border: none`.
  * Hover: `bg: #E06900`, transición `150ms ease`.
* **Variante Secundaria (Dark):**
  * Default: `bg: #1A2B4C`, `text: #FFFFFF`, `border: none`.
  * Hover: `bg: #121E36`.
* **Variante Outline (Terciaria):**
  * Default: `bg: transparent`, `text: #1A2B4C`, `border: 1.5px solid #1A2B4C`.
  * Hover: `bg: rgba(26, 43, 76, 0.08)`.
* **Estado Disabled:**
  * `bg: #E2E8F0`, `text: #94A3B8`, `cursor: not-allowed`, `opacity: 0.8`.

### B. Tarjetas y Contenedores (Cards)
* **Card Estándar (Light):**
  * `background: #FFFFFF`
  * `border: 1px solid #D8E0E8`
  * `border-radius: 12px`
  * `padding: 20px`
  * `box-shadow: 0 4px 12px rgba(26, 43, 76, 0.06)`
* **Card Destacada / Media Player (Dark):**
  * `background: #1A2B4C`
  * `text: #FFFFFF`
  * `border-radius: 12px`
  * Acento superior o barra de progreso en `#FF7A00`.
* **Contenedor Estilo Ventana / Browser Mockup:**
  * Barra superior en `#1A2B4C` con indicadores circulares en `#FF7A00`, `#FFAE42` y `#FFFFFF`.

### C. Inputs y Formularios
* **Estilo Base:** `height: 44px`, `border-radius: 8px`, `border: 1.5px solid #D8E0E8`, `background: #FFFFFF`, `padding: 0 14px`.
* **Estado Focus:** `border-color: #FF7A00`, `outline: 3px solid rgba(255, 122, 0, 0.2)`.
* **Dark Mode / Login Screen:** Fondo de pantalla `#1A2B4C`, inputs con `background: #121E36`, `border: 1px solid #6C7A89`, texto `#FFFFFF` y botón de submit full-width en `#FF7A00` o `#1A2B4C` con borde `#FF7A00`.

---

## 5. Iconografía y Recursos Multimedia

* **Estilo de Iconos UI:** Trazo redondeado (`stroke-width: 2px`), esquinas suaves (`stroke-linecap: round`), tamaño base `20px` o `24px`.
* **Motivos Temáticos (Audio & Media):**
  * Controles de reproducción (Play, Pause, Volumen, Ondas de audio) deben usar `#FF7A00` para el estado activo y `#1A2B4C` para contenedores.
  * **Ecualizador / Ondas sonoras:** Utilizar barras verticales simétricas con bordes redondeados en `rgba(255, 255, 255, 0.15)` sobre fondos oscuros o `#FFAE42` como elemento decorativo de fondo en headers y reproductores.

---

## 6. Prompt de Activación Rápida para el Agente

Si necesitas iniciar una tarea de desarrollo con este manual, copia y pega este encabezado junto a tu requerimiento:

> *"Lee el documento `DESIGN_SYSTEM_MULTIMEDIOS.md`. Construye [NOMBRE DEL COMPONENTE / PANTALLA] respetando estrictamente los design tokens (`#1A2B4C`, `#FF7A00`, `#FFAE42`, `#6C7A89`), las reglas de contraste WCAG y la jerarquía tipográfica definida. Utiliza el estilo visual moderno de audio/multimedia de la marca."*