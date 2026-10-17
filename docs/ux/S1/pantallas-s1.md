# Pantallas del S1 · walking skeleton

> **Refinamiento del S1 (2026-10-13).** Recorte del flujo aprobado en el Pre-S1 ([`../flujo-e2e.md`](../flujo-e2e.md), dirección C, `[Pre-S1 resp. 10, 14…17]`) a lo que el S1 construye. Las pantallas **extienden patrones ya resueltos**: la página de login y la variante S1–S4 de la pantalla 09. Por eso hay **un solo diseño**, sin 3 variantes (regla de `/sprint-refine`, fase 3).
> **Referencias visuales:** [`../prototipo/fuente/Login.dc.html`](../prototipo/fuente/Login.dc.html), [`Analisis.dc.html`](../prototipo/fuente/Analisis.dc.html), [`Resultado.dc.html`](../prototipo/fuente/Resultado.dc.html) y [`Estados.dc.html`](../prototipo/fuente/Estados.dc.html). Tokens y componentes: [`../sistema-de-diseno.md`](../sistema-de-diseno.md).
> **Datos:** solo sintéticos. El paciente es el semilla (a) de OL-01 (mama, HER2 3+). Los corchetes son marcadores que se llenan desde el contrato.
> **Rutas:** en español `[S1 resp. 4]`.
> **Historias:** US-211 (login), US-060 (Route Handler), US-061 (panel), US-068 (términos prohibidos), US-069 (aviso de IA y etiqueta).

## Qué se recorta respecto del flujo completo

| Elemento del flujo completo | En el S1 | Llega en |
|---|---|---|
| Listado de pacientes (02), caso clínico (04) y pestañas | No existen. Se entra por ruta directa | S2 (US-048, US-051) |
| Barra del paciente con nombre y diagnóstico | Solo "Paciente · ID [uuid abreviado]", tomado de la ruta. Sin identidad ni PHI | S2 (US-046, US-051) |
| "Cerrar sesión", expiración y bloqueo | No hay botón ni pie de expiración | S2 (US-044) |
| Fuentes (`sourcesSelected`) y antigüedad | No hay controles. `clinical-api` aplica el valor por defecto (`EVIDENCE_DEFAULT_YEARS`) | S3 y S5 (US-115, US-220) |
| Progreso por pasos y botón Cancelar | Botón deshabilitado con "Analizando…" | S3 (US-062) |
| Columna izquierda: resumen del caso y "Datos críticos usados" | Solo "Fragmento citado" | S2 y S3 (US-067, FEAT-02b) |
| Tabla de aplicabilidad y hasta 3 opciones | Una sola opción, sin tabla | S5 (US-125, US-134) |
| Base del análisis | No se muestra | S2 (US-067) |
| Seguimiento y feedback | No existen | S5 |
| URL propia del resultado (`/analisis/[analysisId]`) | El resultado aparece en la misma página tras el POST. El contrato no tiene `GET /platform/evidence-analyses/{id}` | Historial (`si-hay-capacidad`) |

## S1-01 · Inicio de sesión · `/login` (US-211)

| Elemento | Texto | Dato del contrato |
|---|---|---|
| Marca | "OncoLens" | — |
| Etiqueta | "Uso académico/investigación" | — (RN-19) |
| Título | "Iniciar sesión" | — |
| Subtítulo | "Herramienta de apoyo para el análisis de evidencia. No sustituye el juicio clínico." | — |
| Campo 1 | Label visible "Correo electrónico", `type=email`, `autocomplete=username` | `LoginRequest.email` |
| Campo 2 | Label visible "Contraseña", `type=password`, `autocomplete=current-password` | `LoginRequest.password` |
| Botón | "Iniciar sesión". Mientras carga: deshabilitado, "Entrando…" | `POST /api/auth/login` → `POST /platform/auth/login` |
| Error | "Correo o contraseña incorrectos." Es genérico, igual para los tres casos de US-211 AC-2, en una región `role="alert"` asociada al formulario | `401 CREDENCIALES_INVALIDAS` |
| Destino | La ruta de inicio configurada. En el S1: `/pacientes/[id]/analisis` del paciente semilla (a) | `204` + cookie `oncolens_session` |

Fuera del S1: el pie "La sesión expira…" y el bloqueo por intentos (US-044, S2), y "Solicitar registro" (US-221, S6).

## S1-08/09 · Análisis de evidencia · `/pacientes/[id]/analisis` (US-060, US-061, US-068, US-069)

Una sola página (`main` con `h1` "Análisis de evidencia"): formulario arriba y resultado debajo. El resultado **se anuncia** en una región `role="status"` (`aria-live="polite"`) breve, fuera del contenedor del resultado (US-061 AC-6); el contenedor no es *live*. En escritorio, layout C: el resultado en la columna principal y "Fragmento citado" en la lateral. A 375 px las columnas se apilan y el fragmento se abre debajo de la cita.

### Cabecera (todas las páginas autenticadas)

| Elemento | Texto | Dato |
|---|---|---|
| Marca | "OncoLens" sobre navy (`--color-brand`) | — |
| Etiqueta permanente | "Uso académico/investigación" | — (US-069 AC-3) |
| Paciente | "Paciente · ID [8 primeros caracteres del UUID]" | parámetro de ruta `[id]` (no hay llamada a la ficha en el S1) |

### Formulario

| Elemento | Texto | Dato |
|---|---|---|
| Label del `textarea` | "Pregunta clínica" | `EvidenceAnalysisRequest.query` (máximo 2000) |
| Ayuda | "No escribas nombres ni documentos: el contexto que sale hacia la IA se desidentifica siempre." | — (RN-11) |
| Contador | "[n] / 2000". No es *live* en cada tecla: se anuncia solo a partir de 1900 | longitud de `query` |
| Botón | `<button type="submit">` "Analizar evidencia" (US-068 AC-4). Mientras espera: `aria-disabled="true"` (no `disabled`, para no perder el foco) y "Analizando…" | `POST /api/evidence-analyses` |
| Región de estado | `role="status"` fuera del resultado: "Analizando…" → "Análisis listo: [n] opción descrita" · "Sin evidencia sobre el umbral" · "No se pudo completar el análisis. Código de traza [traceId]" | `status`, `traceId` |
| Texto de espera | "El contenido aparece completo cuando está validado." | — (TBD-08: progreso, nunca contenido) |

### Resultado `con_evidencia` con una opción (US-061 AC-1…AC-3)

Orden de arriba abajo:

1. **Pregunta:** "[queryText]" · idioma "[queryLanguage]" · "[createdAt, fecha y hora locales]".
2. **Aviso IA** (`role="note"`, bloque navy): el campo `disclaimer` tal cual lo devuelve `clinical-api`, sin texto propio de `web` (US-069 AC-2). Literal de PRD E-11 `[S1 resp. 32]`: "Generado por IA; requiere validación clínica independiente por el oncólogo tratante." `disclaimer` lleva **solo** esa frase; "Uso académico/investigación" es la etiqueta aparte de la cabecera y del pie.
3. **Encabezado** `h2`: "Opciones descritas en la evidencia".
4. **Criterio de selección**, encima de la tarjeta: "Ordenado por relevancia de recuperación de la búsqueda; no representa prioridad ni aplicabilidad clínica." (US-061 AC-3, `[S1 resp. 28]`). Es un literal i18n: `evidence.orderCriterion.relevance`.
5. **Tarjeta de opción** (`evidenceOptions[0]`):
   - título `h3`: `option`;
   - justificación: `rationale`, con "la evidencia" o "las fuentes" como sujeto (RN-23);
   - **citas** (`citedSources[]`), un chip por cita con `sourceName` · `externalId`. Al expandirlo:
     - `title` (con `lang` BCP 47 tomado de `language`);
     - `authors`;
     - `studyDesign`;
     - `publishedAt` / `lastUpdatedAt`;
     - `language`;
     - `licenseClass` como texto ("Dominio público", "CC BY"…);
     - **cualquier campo ausente del catálogo se muestra como "No disponible"** (RN-25), nunca se omite ni se rellena;
     - "Ver fragmento" (`button` con `aria-expanded` y `aria-controls`), que abre `chunkTextSnapshot` en su idioma original, sin traducción (`[S1 resp. 8]`), y lleva el foco al encabezado del fragmento;
     - "Fuente original" (`sourceUrl`, enlace externo con `rel="noopener noreferrer"`);
   - al final, en estilo secundario: "Relevancia de recuperación de evidencia [relevanceScore con coma decimal: 0,87]" (rótulo exacto de US-061 AC-2, `[S1 resp. 28]`), la línea "Orden basado en la cita recuperada más relevante asociada a cada opción" y la nota "Metadato secundario: no mide eficacia ni solidez clínica" (RN-03). La ayuda aclara que no resume la aplicabilidad, la eficacia ni la calidad global de la opción;
   - la tarjeta **no tiene ningún botón** de aplicar, registrar ni modificar datos (US-070 AC-3).
6. **Descartadas** (`discardedOptions[]`): solo si las hay.
7. **Pie:** el `disclaimer` de nuevo y "Uso académico/investigación".

### Columna "Fragmento citado"

`aside` con `aria-label="Fragmento citado"`. Se abre con "Ver fragmento"; el foco va a su encabezado (`tabindex="-1"`) y un enlace "Volver a la cita" devuelve el foco al chip de origen. Muestra:
- el texto `chunkTextSnapshot` en su idioma original, con `lang="[language]"`;
- `sourceName` · `title`;
- `licenseClass` y `authors`, o "No disponible".

Si no hay fragmento abierto, muestra la ayuda "Abre «Ver fragmento» en una cita para leer el texto original recuperado en esta consulta".

### Estados del S1

| Estado | Disparador | Qué se ve | Bloquea |
|---|---|---|---|
| Con opción | `con_evidencia`, `evidenceOptions` = 1 | Lo descrito arriba | — |
| Solo descartadas | `con_evidencia`, `evidenceOptions = []` y `discardedOptions` ≥ 1 (US-061 AC-4) | Aviso IA y la frase "No hay opciones descritas con soporte verificable en la evidencia recuperada." Sin tarjeta de opción. Sección colapsada "Descartadas por falta de soporte — solo para revisión" (literal de US-061 AC-4), con la línea "No son opciones descritas: se muestran solo para revisión."; al expandirla, `option`, el motivo (`discardReason`, enum → texto i18n: `cita_invalida` "La cita no corresponde a un fragmento recuperado", `afirmacion_sin_soporte` "Una afirmación no tiene soporte en la fuente o contenía lenguaje no permitido", `sin_citas` "La opción no incluye citas a fragmentos recuperados", `solo_soportada_por_analisis_previo` "Solo la respalda un análisis previo, que no es evidencia") y cada `unsupportedClaims[]` resaltada con el rótulo "Sin soporte" (texto, no solo color). Cada descartada lleva para auditoría su número de orden, el id del análisis y `createdAt` (`[S1 resp. 29]`); nunca se presenta como contenido clínico utilizable. Sin controles de vínculo | — |
| Sin opciones (pregunta no terapéutica) | `con_evidencia`, sin opciones ni descartadas (US-061 AC-5) | Aviso IA y la frase "La evidencia recuperada no describe opciones para esta pregunta." No aparecen el encabezado de opciones ni la sección de descartadas | — |
| Sin evidencia (mínimo del S1) | `sin_evidencia` (US-069 AC-4) | Aviso IA. "Ningún fragmento del corpus superó el umbral de relevancia. No se generaron opciones." y "Relevancia máxima: no aplica", porque `topRelevanceScore = null` y nunca se muestra 0 (RN-02). El estado completo, con "qué se buscó", llega en US-062 (S3) | — |
| Error (mínimo del S1) | `4xx`/`5xx` salvo `401`; `502`, `503`, `504` | Mensaje por código: `503` "El modelo local no está disponible. No se muestra ningún resultado parcial."; `504` "El análisis superó el tiempo máximo de espera. No se muestra ningún resultado parcial."; `502` y el resto "No se pudo completar el análisis. No se muestra ningún resultado parcial."; siempre "Código de traza: [traceId]", sin detalles internos. El formulario conserva la pregunta y permite **reintentar** con una petición nueva (`[S1 resp. 31]`). El estado completo llega en US-062 (S3) | — |
| Análisis no realizado | `422 TIPO_CANCER_NO_REGISTRADO` (`[S1 resp. 35]`) | "Análisis no realizado: falta el tipo de cáncer; no fue posible filtrar la evidencia." Sin aviso IA, porque no hay análisis, y sin "sin evidencia" | — |
| Sin sesión | `401`, o entrar a la ruta sin cookie | Redirección a `/login`. El HTML servido no contiene datos del paciente (US-211 AC-4) | Sí (acceso) |

En el S1 no hay camino hacia `tipo_no_habilitado` (US-043, S2), `403` por opt-out (S6) ni `422` por egresado (Post-MVP). La pantalla 10 del flujo los cubre cuando lleguen.

## Accesibilidad (WCAG 2.1 AA, sobre los tokens del Pre-S1)

- **Labels:** todos los campos tienen label visible asociado; la ayuda y el contador van por `aria-describedby`.
- **Foco y teclado:**
  - Orden de foco: campos → botón → resultado → chips de cita → "Ver fragmento" → "Fuente original" → descartadas; "Volver a la cita" desde el fragmento.
  - Todo se activa con Enter o Espacio.
  - Los chips son `button` con `aria-expanded`.
  - Al llegar el resultado, el foco **no salta** y el botón conserva el foco (`aria-disabled`); el aviso breve sale por la región `role="status"`.
  - **Foco visible:** anillo `--color-primary` (7,32:1 sobre blanco); **sobre la cabecera navy, anillo blanco** (15,8:1), porque el primario sobre navy da 2,16:1 y no pasa 1.4.11.
- **Color:** nada se transmite solo por color.
  - Rótulo "Sin soporte": texto `#8E1F18` sobre `#F9E3E1` (7,25:1) con símbolo.
  - Chip de cita: texto `#1D4F7A` (8,57:1) y borde `--color-control-border` `#7C8696` (3,68:1). No se usa el borde `#9DBBDB` del prototipo, que da 1,99:1.
  - Relevancia secundaria: `#44506A` (8,07:1).
- **Idioma:** el fragmento y el `title` de la cita llevan `lang` BCP 47 tomado de `language`, para que el lector de pantalla cambie de voz.
- **Login:** campos con `required` y `aria-required`; botón `<button type="submit">` (el prototipo usa un `<a>` "Entrar" y el label "Usuario": no se copian).
- **Tamaño:** objetivos táctiles ≥ 44 × 44 px (regla del proyecto; en 2.1 es AAA). A 375 px no hay desplazamiento horizontal: `externalId`, DOI y URL usan `overflow-wrap: anywhere`.

## Dato del contrato por elemento (verificación)

Contrato: `apps/clinical-api/openapi.yaml` (congelado en US-033) y `contracts/examples/con-evidencia-s1.json` y `sin-evidencia.json`.

| Elemento | Campo | ¿Existe? |
|---|---|---|
| Login | `POST /platform/auth/login`, `401 CREDENCIALES_INVALIDAS` | ✓ |
| Pregunta | `EvidenceAnalysisRequest.query` | ✓ |
| Metadatos | `queryText`, `queryLanguage`, `createdAt` | ✓ |
| Aviso | `disclaimer` | ✓ (literal: ver *Revisiones*) |
| Opción | `evidenceOptions[].option`, `rationale`, `relevanceScore` | ✓ |
| Cita | `citedSources[].sourceName`, `externalId`, `title`, `authors`, `studyDesign`, `publishedAt`, `lastUpdatedAt`, `language`, `licenseClass`, `sourceUrl`, `chunkTextSnapshot` | ✓ |
| Descartadas | `discardedOptions[].option`, `discardReason` (enum), `unsupportedClaims[]` | ✓ |
| Sin evidencia | `status`, `topRelevanceScore = null` | ✓ |
| Error | `traceId` del cuerpo de error | ✓ |
| Paciente | parámetro de ruta (sin campo del contrato) | n/a: no muestra datos del paciente |

Ningún elemento exige un dato que el contrato no tenga.

## Revisiones

| Revisión | Resultado | Aplicado |
|---|---|---|
| `clinical-language-auditor`, modo Diseño (2026-10-13) | FAIL sin bloqueantes: 2 Mayores (literal del aviso y su duplicación; "no ordena" contradice la selección por relevancia) y 5 Menores | Todo aplicado. **Excepción:** no se cambia el rótulo "Relevancia de la evidencia" por "Relevancia de la búsqueda", porque es el literal de US-061 AC-2; se corrige la nota que lo acompaña. Tampoco se cambia el literal de descartadas de US-061 AC-4; se le añade la línea explicativa |
| Accesibilidad WCAG 2.1 AA (2026-10-13) | FAIL sin críticos: 4 Mayores (foco sobre navy 2,16:1; región *live* demasiado amplia y `aria-busy`; ida y vuelta al fragmento con teclado; tokens del rótulo y del chip) y 4 Menores | Todo aplicado en este documento. El anillo blanco sobre navy pasa a `sistema-de-diseno.md` |
| Contrato | Ningún dato exige un campo que el contrato no tenga | El literal de `disclaimer` (dos puntos, solo la primera frase) se corrige en el contrato y los ejemplos con el change de US-069 `[S1 resp. 9]` |
