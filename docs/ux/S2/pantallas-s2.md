# Pantallas del S2 · acceso, listado, ficha y Base del análisis

> **Refinamiento del S2 (2026-10-20).** Recorte del flujo aprobado en el Pre-S1 ([`../flujo-e2e.md`](../flujo-e2e.md), dirección C) a lo que el S2 construye, coherente con [`../sistema-de-diseno.md`](../sistema-de-diseno.md) y con las pantallas del S1 ([`../S1/pantallas-s1.md`](../S1/pantallas-s1.md)).
> **Un solo diseño por pantalla:** todas **extienden patrones ya resueltos** (login, cabecera, tabla, avisos que no bloquean y tarjeta del panel). Ninguna introduce riesgo de UX nuevo del tipo que pide tres variantes (vista de caso, faltantes y revisión, aplicabilidad con hasta 3 opciones llegan en S3–S5).
> **Referencias visuales:** [`../prototipo/fuente/`](../prototipo/fuente/) (`Login`, `Pacientes`, `Caso`, `Analisis`, `Resultado`, `Estados`).
> **Datos:** solo sintéticos (pacientes semilla de OL-01). Los corchetes son marcadores que se llenan desde el contrato. **Rutas** en español `[S1 resp. 4]`.
> **Historias:** US-044 (sesión), US-046 y US-051 (ficha con identidad descifrada), US-048 (listado y búsqueda), US-043 (tipo no habilitado), US-067 (Base del análisis), ARR-02 AC-3 (login en Tailwind v4 + shadcn/ui).

## Qué entra y qué sigue recortado

| Elemento del flujo completo | En el S2 | Llega en |
|---|---|---|
| Listado y búsqueda (02) | **Sí** | — |
| Ficha mínima (04, parte superior: identidad, diagnóstico vigente, biomarcadores recientes) | **Sí**, sin "Abrir vista de caso" ni "Registrar un dato a mano" | S3 (US-090) · S4 (registro manual) |
| Carga de documentos (05) | Solo la API (US-076); la UI con estados depende de la extracción | S3 (US-079, con US-082) — *pendiente de aprobación del slicing, pregunta P-1* |
| Barra del paciente | Nombre descifrado, diagnóstico y "SINTÉTICO" (US-046, US-051) | — |
| "Cerrar sesión", expiración y bloqueo | **Sí** (US-044) | — |
| Base del análisis en el panel (09, bloque 8) | **Sí**, resumen sin expandir + detalle (US-067) | Incisos h, i: Post-MVP |
| Tendencia ↑ ↓ = | `trend = null` → "Sin tendencia calculada" | `si-hay-capacidad` (US-091, DEC-08) |
| Registro de paciente (03) | No | S4 |

## S2-00 · Cabecera autenticada (todas las páginas)

| Elemento | Texto | Dato |
|---|---|---|
| Marca | "OncoLens" sobre navy (`--color-brand`) | — |
| Etiqueta permanente | "Uso académico/investigación" | — (RN-19) |
| Navegación | "Pacientes" (enlace a `/pacientes`) | — |
| Usuario | Correo del usuario de la sesión y botón **"Cerrar sesión"** (`<button>`; formulario con `POST /api/auth/logout`, CSRF por `Origin`) | sesión leída por `web` en el servidor (BFF, sin endpoint nuevo en `clinical-api`) · `POST /platform/auth/logout` |
| Barra del paciente (solo en rutas `/pacientes/[id]/…`) | "[nombre completo] · [tipo y número de documento] · [año de nacimiento] · [diagnóstico: tipo, CIE-10, estadio] · etiqueta de origen" | `PatientSummary.identification`, `birthYear`, `diagnosis`, `dataOrigin` |

La identidad completa **solo** aparece en la barra y en la ficha (respuesta de `GET /platform/patients/{id}`, con auditoría); nunca en la URL, el título del documento (`<title>` = "Paciente · OncoLens" en `/pacientes/[id]/…` y "Pacientes · OncoLens" en el listado), los *logs* ni el análisis (RN-10).

## S2-01 · Inicio de sesión · `/login` (US-044, ARR-02 AC-3)

Igual que S1-01, migrado a Tailwind v4 + shadcn/ui (`Card`, `Input`, `Label`, `Button`, `Alert`) con los tokens del sistema de diseño. Se añaden:

| Elemento | Texto | Dato |
|---|---|---|
| Pie | "La sesión expira tras un periodo de inactividad." (literal sin cifra: el contrato no expone `SESSION_IDLE_MINUTES`) | TTL en configuración (RN-22) |
| Bloqueo | **El mismo** "Correo o contraseña incorrectos." genérico del `401` (US-044 AC-2: el bloqueo no se revela) | `401` |
| Sesión expirada | Aviso informativo (`role="status"`) "Tu sesión expiró. Vuelve a iniciar sesión." al llegar con `?motivo=expirada` | redirección del guard |
| Sesión cerrada | "Cerraste sesión." (`role="status"`) al llegar con `?motivo=cerrada` | `POST /api/auth/logout` → `204` |

El parámetro `motivo` solo admite esos dos valores; nunca lleva datos del paciente ni la ruta de origen (US-211 AC-4).

## S2-02 · Pacientes · `/pacientes` (US-048, US-043)

- **Encabezado** `h1` "Pacientes".
- **Búsqueda** (`<form role="search">`), dos modos en pestañas (`Tabs` de shadcn):
  - "Por documento": selector de tipo (`idType`, valores habilitados en configuración) + número (`inputmode="numeric"`). Exacta por índice ciego: un número parcial no encuentra nada.
  - "Por nombre": nombre completo. Coincidencia **exacta sobre el nombre normalizado** (sin tildes, sin mayúsculas, espacios colapsados) — *escenario recomendado, pregunta P-4*.
  - Botón "Buscar" → `POST /api/patients/search` → `POST /platform/patients/search`. La identidad va **en el cuerpo**, nunca en la URL ni en el historial del navegador (`[Pre-S1 resp. 22]`).
  - "Limpiar búsqueda" vuelve al listado.
- **Filtros** del listado (sin identidad, sí en la URL): Estado (`status`) y Origen (`dataOrigin`). `GET /api/patients?status=&dataOrigin=&page=`.
- **Tabla** (`PatientListItem`, identidad **enmascarada**):

| Columna | Dato | Notas |
|---|---|---|
| Paciente | `fullNameMasked` · `nationalIdMasked` (formato de US-048 AC-7) · `birthYear` | Enlace a `/pacientes/[id]`. **Sin columna de diagnóstico:** `PatientListItem` no la trae (contrato congelado); el diagnóstico se ve en la ficha |
| Faltantes críticos | `missingCriticalCount` | Texto informativo ("2 faltantes"); no bloquea (RN-26) |
| Por revisar | `pendingReviewCount` | Número + texto ("0 por revisar"), no solo color |
| Estado | `lifecycleStatus` | Texto |
| Origen | `dataOrigin` como etiqueta: "SINTÉTICO" | US-048 AC-1 |
| Alcance | si `cancerTypeEnabled = false`: "Tipo de cáncer fuera del alcance del piloto: sin análisis con IA" | US-043 AC-3; no oculta la fila |

- **Paginación:** "Página [n] de [m]" con "Anterior"/"Siguiente" (`PATIENTS_PAGE_SIZE`).
- **Estados:** cargando (filas esqueleto, `aria-busy="true"`), vacío del listado ("Aún no hay pacientes registrados."), sin resultados de búsqueda ("No hay pacientes con ese documento." / "No hay pacientes con ese nombre." — sin enlace a registrar hasta el S4), error ("No pudimos cargar el listado. Intenta de nuevo. Código de traza [traceId]"), `401` → `/login?motivo=expirada`.

## S2-04 · Ficha del paciente · `/pacientes/[id]` (US-051, US-046, US-043)

- **Encabezado** `h1` "[nombre completo]" (identidad descifrada solo aquí y en la barra) y la etiqueta de origen.
- **Avisos superiores** (no bloquean, RN-26; componente `Alert` informativo, nunca de error):
  - "[n] datos por revisar · no bloquean el análisis" si `pendingReviewCount > 0`;
  - "Tipo de cáncer fuera del alcance del piloto: sin análisis con IA" si `cancerTypeEnabled = false` (US-043 AC-3; los datos se siguen mostrando).
- **Identificación:** tipo y número de documento completos, año de nacimiento, estado del ciclo de vida. (Representante legal: solo si existe; sin datos en el seed adulto.)
- **Diagnóstico vigente** (`Diagnosis` con `is_active = true`):

| Fila | Dato |
|---|---|
| Tipo | `cancerType` y CIE-10 (`icd10Code`) |
| Histología | `histology` (y `histologyCode` si existe) |
| Gradación | `grade` y, en próstata, `gradings[]` (Gleason/ISUP con espécimen y alcance, DEC-05) |
| Estadio | `stagingSystem` / `stageValue` |
| Estado funcional | `performanceScale` / `performanceValue` |
| Diagnosticado | `diagnosedAt` (fecha local) |
| Origen y revisión | `provenance.entryMethod`: "Carga inicial" (`seed`), "Registro manual" (`manual`), "Extraído de documento" (`ocr`), "Corrección manual" (`manual_correction`) + `provenance.reviewStatus` en texto (US-051 AC-5) |

  Campo ausente → "No registrado" (dato del paciente, no del catálogo; no confundir con "No disponible" de RN-25).
- **Biomarcadores recientes** (último valor por biomarcador): Biomarcador (`name` + LOINC) · Valor (`value` `unit`, `performedAt`) · Rango (`referenceRange`) · Tendencia: "Sin tendencia calculada" mientras `trend = null` · Significancia (`clinicalSignificance` con símbolo **y** texto) · Origen y revisión (`provenance.entryMethod` con los mismos cuatro textos, y los dos ejes `provenance.extractionConfidence` y `provenance.reviewStatus`, RN-07).
- **Acciones:** **"Analizar evidencia"** (primaria; enlace a `/pacientes/[id]/analisis`). Con `cancerTypeEnabled = false` el enlace sigue visible y el análisis responde `tipo_no_habilitado` (no se bloquea en la UI: el backend es el dueño de la regla).
- **Estados:** cargando (esqueleto), `404` "Paciente no encontrado" con enlace "Volver a pacientes" (US-051 AC-2), error con código de traza, `401` → login.

## S2-09 · Base del análisis en el panel · `/pacientes/[id]/analisis` (US-067)

Se añade al resultado del S1 (después de las opciones y las descartadas, antes del pie), dentro del mismo contenedor anunciado.

- **Encabezado** `h2` "Base del análisis".
- **Resumen sin expandir** (una línea, siempre visible, también en `sin_evidencia`):
  "Faltantes: [n] · Supuestos: [n] · Fuentes no incluidas: [lista] · Afirmaciones omitidas: [n]" y "Evidencia del corpus al [fecha de corte, dd/mm/aaaa]".
  - `analysisBasis.missingCriticalData.length`, `assumptions.length`, `sourcesNotIncluded[]` (p. ej. "NCCN, ESMO (licencia no abierta)", solo como exclusión `[Pre-S1 resp. 12]`), `omittedClaims`, `corpusCutoffDate`.
- **Control** `<button aria-expanded="false" aria-controls="base-detalle">` "Ver detalle de la Base" → "Ocultar detalle" (US-067 AC-5).
- **Detalle:**
  - "Datos del paciente usados": lista de `patientDataUsed[]` con su estado de revisión **en texto** ("Verificado", "Por revisar"…);
  - "Fuentes consultadas": `sourcesConsulted[]` con "[n] fragmentos recuperados · [m] sobre el umbral";
  - "Supuestos" y "Limitaciones": `assumptions[]` y `limitations[]` si existen, cada uno rotulado por su `origin`: "Regla del catálogo" (`regla_catalogo`) o "Redactado por IA y verificado" (`llm_verificado`).
- **`sin_evidencia`** (US-067 AC-3): el resumen añade "Qué se buscó: fuentes [lista] · filtros [lista o 'ninguno'] · 0 fragmentos sobre el umbral". No se muestra ninguna opción.
- **Omitidas** (US-067 AC-4): solo el número; el texto de una afirmación omitida **nunca** aparece.
- Ningún puntaje clínico; `relevance_score` sigue como metadato secundario de las citas (RN-03).

> Los nombres exactos de los campos de `analysisBasis` se toman del `openapi.yaml` de `clinical-api` (fuente única); si alguno de los de arriba no existe con ese nombre, prevalece el contrato y `frontend-dev` lo mapea, sin añadir campos (el cambio de contrato iría por ADR-26).

## Accesibilidad y lenguaje (todas)

- WCAG 2.1 AA: contraste de los tokens del sistema; el estado nunca solo por color (símbolo + texto); foco visible; tablas con `<th scope>`; pestañas de búsqueda con el patrón ARIA de `Tabs`; regiones `role="status"` para resultados de búsqueda y avisos de sesión.
- Visual-check a 375 y 1280 px sin errores de consola ni violaciones de CSP.
- Lenguaje no prescriptivo (RN-23): ningún texto nuevo de estas pantallas describe tratamientos; los avisos son informativos y **no bloquean** (RN-26).
