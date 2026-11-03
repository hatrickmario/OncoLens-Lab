# Pantallas del S5 · caso registrado y editado a mano, vista de caso mínima, faltantes con acción y preguntas de seguimiento

> **Refinamiento del S5 (2026-11-03).** Solo lo que el S5 crea o cambia en la UI, coherente con [`../sistema-de-diseno.md`](../sistema-de-diseno.md) (dirección C «Mesa de trabajo»), [`../flujo-e2e.md`](../flujo-e2e.md) (pantallas 04, 07 y 09) y [`../S4/pantallas-s4.md`](../S4/pantallas-s4.md).
> **Slicing (D-1, `[S5 resp. 1]`, [`S5-refinamiento.md`](../../../backlog/sprints/S5-refinamiento.md)):** entra la **vista de caso mínima** (US-088 + US-090; D-8): timeline, sin fecha confiable, tratamientos previos, atributos, serie en tabla y la columna «Datos críticos» con «Ingresar a mano» (pantalla 07). La corrección con histórico (US-253) vive en la **ficha** (pantalla 04), donde están las tablas de diagnóstico y biomarcadores.
> **Variantes:** S5-01 (corregir un dato ya registrado, con su histórico) es **riesgo de UX nuevo** → 3 variantes; **elegida A** (`[S5 resp. 4]`). S5-02 (faltantes con acción en la vista de caso), S5-03 (formularios de registro), S5-04 (hilo de seguimiento) y S5-05 (vista de caso mínima) extienden patrones resueltos en el Pre-S1 (pantallas 06, 07 y 09) → un solo diseño.
> **Datos:** solo sintéticos («Paciente sintético M-02», documento enmascarado `CC ••• 0002`). Textos en `apps/web/messages/es.json` (US-068 recorre la lista de términos prohibidos).
> **Historias:** US-253, US-110, US-111, US-094, US-004, US-088, US-090, US-218, US-219, US-071 (recorrido sin bloqueos) (y US-250, US-093, US-116, sin UI propia).

## Qué entra y qué sigue recortado

| Elemento | En el S5 | Llega en |
|---|---|---|
| Vista de caso mínima: timeline, sin fecha confiable, tratamientos previos, atributos, serie en tabla | **Sí** (US-088, US-090; D-8) | Agrupación por línea con fuentes adicionales y gráfico de la serie: US-089 (S6 `si-hay-capacidad`) |
| Datos críticos con estado y acción («Registrar a mano») en la vista de caso | **Sí** (US-004) | — |
| Registrar biomarcador y completar diagnóstico (gradación estructurada) | **Sí** (US-110, US-111) | — |
| Registrar tratamiento previo y atributo clínico (p. ej., estado menopáusico) | **Sí** (US-094) | — |
| Corregir biomarcador, examen o nota clínica con histórico visible | **Sí** (US-253) | — |
| «Cargar documento» desde un faltante | **No** (OCR a Post-MVP, PRD E-17) | Post-MVP |
| Preguntas de seguimiento bajo el análisis | **Sí** (US-218, US-219) | Historial de conversaciones: S6 (US-255) |
| Feedback 1–5 | No (propuesta D-3) | S6 |
| Avisos de datos sin verificar o en conflicto en la tarjeta | No | S6 / Post-MVP (sin extracción no hay datos sin verificar nuevos) |

## S5-01 · Corregir un dato ya registrado, con su histórico (3 variantes)

**Común a las 3 variantes:**

- Acción por fila: **«Corregir dato»** (nunca «Editar» a secas: comunica que el valor anterior se conserva, RN-08). Solo para el rol `doctor`; `admin` no ve la acción (y el servidor responde `403`, US-253 AC-4).
- Al guardar, la fila muestra el valor nuevo con el rótulo de origen **«Corrección manual · [fecha relativa]»** y el anterior pasa a **«Histórico»**; nunca desaparece.
- Paciente egresado: la acción está deshabilitada con el texto «El paciente está egresado: no admite registros hasta su reactivación» (RN-17; es regla legal, sí bloquea).
- Nota libre: aviso fijo encima del campo: «Las notas no se envían a la IA en esta versión; conviene no incluir nombres de personas en ellas.» (ADR-40, RN-11, US-253 AC-6).
- Validación: `422` → mensaje junto al campo, anunciado en `aria-live="assertive"`, sin cambios (US-253 AC-3).
- Tras guardar, aviso que no bloquea: «Los análisis anteriores se hicieron con el valor previo. Un análisis nuevo usará el valor corregido.» (RN-26, US-253 AC-5).

### Variante A · Corrección en línea con histórico desplegable bajo la fila **(elegida, `[S5 resp. 4]`)**

```
Biomarcadores recientes                                      [+ Registrar biomarcador]
┌───────────┬────────────┬──────────────┬─────────────────────────────┬───────────┐
│ Biomarc.  │ Valor      │ Fecha        │ Origen                      │           │
├───────────┼────────────┼──────────────┼─────────────────────────────┼───────────┤
│ Ki-67     │ 25 %       │ hace 12 días │ Corrección manual · hoy     │ Corregir dato │
│   ▸ Histórico (1): 20 % · hace 12 días · Registro manual · reemplazado         │
│ HER2      │ 3+ (IHQ)   │ hace 40 días │ Carga inicial           │ Corregir dato │
└───────────┴────────────┴──────────────┴─────────────────────────────┴───────────┘
  «Corregir» abre en la misma fila: [valor] [unidad] [fecha]  (Guardar mi corrección) (Cancelar)
```

- **Por qué se propone:** el oncólogo corrige donde lee el dato, sin cambiar de contexto; el histórico queda a un clic y con el estado `reemplazado` explícito (RN-08). Reutiliza `RecentBiomarkersTable` y `ActiveDiagnosisTable` existentes; menor coste de implementación.
- **Riesgo:** filas altas en móvil (375 px). Mitigación: en móvil la fila pasa a tarjeta y el formulario ocupa el ancho completo.

### Variante B · Panel lateral (`Sheet`) de corrección con comparación antes/después

```
Ficha ...................................│ Corregir Ki-67                       ✕
Ki-67  20 %  hace 12 días   [Corregir dato] ──▶│ Valor actual: 20 % · Registro manual
                                          │ Valor nuevo:  [ 25 ] [ % ▾ ]
                                          │ Fecha del examen: [ hace 12 días ]
                                          │ El valor actual quedará como histórico.
                                          │            (Cancelar) (Guardar mi corrección)
```

- **Descartada porque:** añade un componente nuevo (`Sheet`) y su gestión de foco, y separa visualmente la corrección del histórico (que habría que mostrar en otro sitio). Más cara y no aporta información que A no tenga.

### Variante C · Página de «Historial del dato» con línea de versiones

```
/pacientes/[id]/datos/[tipo]/[itemId]
Ki-67 · historial
● 25 %  · Corrección manual · hoy           (vigente)
○ 20 %  · Registro manual · hace 12 días    (reemplazado)
[Corregir valor vigente]
```

- **Descartada porque:** obliga a una ruta y un Route Handler nuevos y saca al oncólogo de la ficha para un cambio de un campo; es útil cuando haya muchas versiones (con OCR), no en el MVP sin extracción.

## S5-02 · Datos críticos con acción, en la vista de caso (un diseño; pantalla 07)

Columna izquierda **«Datos críticos»** de la vista de caso (`CaseView.completeness`, ancla `#datos-criticos`). El enlace del aviso de faltantes del panel de análisis (US-005) pasa a apuntar aquí; la ficha conserva su contador y su enlace «Ver caso clínico».

```
Datos críticos · catálogo 1.2.0                        3 faltantes · no bloquean el análisis
✓ HER2                 Presente y verificado     Carga inicial
◐ Receptores hormonales Presente sin verificar   —
◌ Ki-67                Faltante                  [Registrar a mano]
◌ Estado menopáusico   Faltante                  [Registrar a mano]
◌ Gradación            Faltante                  [Completar diagnóstico a mano]
· Estadio TNM          No aplica                 —
Los faltantes no bloquean: si continúas, el análisis los trata como «desconocido» y lo deja escrito en la Base del análisis.
```

- Estados con **símbolo y palabra** (✓ / ◐ / ◌ / ·), nunca solo color; «Faltante» con icono neutro, no ✕ rojo (sistema de diseño §3.5).
- Acción según `destination.entity` del ítem: `Biomarker` → «Registrar a mano» (formulario S5-03a prellenado con `?item=`); `Diagnosis` → «Completar diagnóstico a mano» (S5-03b); `ClinicalAttribute` → «Registrar a mano» (S5-03c); `PriorTreatment` → «Agregar tratamiento previo» (S5-03d). **Sin «Cargar documento»** (OCR a Post-MVP).
- Origen visible: «Registro manual», «Corrección manual» o «Carga inicial», sin enlace a PDF (US-004 AC-4 recortado: US-212 es Post-MVP).
- `completeness` `5xx` → «No se pudo calcular el checklist» (`ChecklistNoDisponible`, ya existe) y el resto de la ficha se muestra igual (US-004 AC-5).
- Tras guardar un registro, la fila pasa a «Presente y verificado» sin recargar la página (revalidación del RSC).

## S5-05 · Vista de caso mínima (un diseño; pantalla 06 del flujo E2E)

Ruta `/pacientes/[id]/caso`, a la que se llega desde la ficha con «Ver caso clínico». Layout de la pantalla 07: columna izquierda «Datos críticos» (S5-02) y columna principal:

```
Caso clínico · Paciente sintético M-02 · CC ••• 0002              [Analizar la evidencia para este caso]
Línea de tiempo
  hace 14 meses  Diagnóstico · carcinoma ductal infiltrante   Carga inicial
  hace 10 meses  Tratamiento previo · línea 1 (adyuvante)      Registro manual
  hace 2 meses   Progresión                                    Documento
Sin fecha confiable
  Toxicidad cutánea grado 2                                    Documento
Tratamientos previos  (línea · contexto · esquema · inicio · fin · origen)       [+ Agregar tratamiento previo]
Atributos clínicos    (atributo · valor · fecha · origen)                          [+ Registrar atributo]
Series de biomarcadores (tabla: fecha · valor · origen; el gráfico llega con US-089)
```

- Origen siempre en texto: «Documento», «Registro manual», «Corrección manual» o «Carga inicial»; **sin** «Ver documento» ni descarga de PDF (US-212 y el visor son Post-MVP; D-8).
- Los eventos derivados (diagnóstico, exámenes, tratamientos, análisis) llevan su tipo; un análisis previo aparece solo como evento «Análisis de IA», nunca como dato del paciente (RN-24).
- `5xx` de `/case` → «No se pudo cargar la vista de caso» con «Reintentar», sin datos parciales (US-090 AC-6).
- Solo peticiones a `web` (US-090 AC-5).

## S5-03 · Formularios de registro (un diseño; pantalla 07 «Ingresar a mano»)

Formularios cortos en diálogo modal accesible (`Dialog` de shadcn/ui, foco atrapado, `Esc` cierra) — mismo patrón para los cuatro:

| Formulario | Campos | Endpoint |
|---|---|---|
| a · Registrar biomarcador | Biomarcador (autocompletado con términos del catálogo; texto libre → `no_mapeado`), valor, unidad, tipo de resultado, fecha del examen | `POST …/biomarkers` |
| b · Completar diagnóstico a mano | Valores vigentes precargados; histología, sistema y valor de estadio, gradación estructurada (`nottingham` en mama; `gleason_isup` con patrón primario y secundario, espécimen y alcance en próstata), escala y valor funcional, fecha. Aviso: «Guardar registra tu corrección manual; el diagnóstico vigente pasa a histórico.» `grade` se muestra derivado, nunca editable | `POST …/diagnoses` |
| c · Registrar atributo clínico | Atributo (solo los del catálogo para el tipo de cáncer), valor (lista del catálogo), fecha observada | `POST …/clinical-attributes` |
| d · Agregar tratamiento previo | Línea, contexto (`setting`, lista), esquema (texto; se normaliza con el catálogo ATC o queda `no_mapeado`), inicio, en curso / fin y motivo | `POST …/prior-treatments` |

- Etiqueta visible en cada campo; errores junto al campo y anunciados (`aria-live`); botón primario «Guardar»; secundario «Cancelar».
- Un término sin código: «Sin código en el catálogo versionado: queda como no mapeado; nunca se inventa un código.» (RN-27).

## S5-04 · Preguntas de seguimiento bajo el análisis (un diseño; pantalla 09 punto 9)

Se implementa tal como está en [`../flujo-e2e.md`](../flujo-e2e.md) pantalla 09 punto 9, con estos textos:

```
Preguntas de seguimiento sobre este análisis                       2 de 10 preguntas usadas
┌ Contexto fijo de esta conversación ───────────────────────────────────────────────┐
│ Paciente desidentificado · datos usados por el análisis · su pregunta y hallazgos  │
│ · evidencia del mismo corpus. Los hallazgos del análisis son contexto, no evidencia.│
└────────────────────────────────────────────────────────────────────────────────────┘
Pregunta 1 · ¿Qué población estudió la fuente de la opción descrita 2?
  La fuente reporta que … [1] [2]           [2] nueva en el seguimiento
  Cada afirmación cita un fragmento del corpus recuperado para esta pregunta o enlaza a un dato del paciente. Fuente, año y población: del catálogo, o «No disponible».
  Base de esta respuesta: datos del paciente usados · ausentes: [missingCriticalData]
  [Aviso RN-19 y «Uso académico/investigación», leídos de configuración (B-06), en cada turno generado]
[ Escribe una pregunta sobre los hallazgos de este análisis ]                   (Preguntar)
```

- Mientras se procesa: solo pasos de progreso («Buscando evidencia…», «Validando citas…»), nunca texto parcial (TBD-08).
- `sin_evidencia`: «No se encontró evidencia suficientemente relacionada con esta pregunta en el corpus. Puedes reformularla o abrir un análisis nuevo.» + «Nuevo análisis» (el filtro de antigüedad es de US-220, fuera del S5).
- `fuera_de_contexto`: «Esta pregunta no trata sobre los hallazgos de este análisis. Para otro tema o paciente, abre un análisis nuevo.» + «Nuevo análisis».
- `409 LIMITE_SEGUIMIENTO`: «Se alcanzó el límite de 10 preguntas de este análisis. Abre un análisis nuevo para continuar.» + «Nuevo análisis».
- Historial de turnos con `aria-live="polite"`; `visual-check` a 375 y 1280 px.

## Dato del contrato por elemento (verificación)

| Elemento | Dato | Existe |
|---|---|---|
| Datos críticos, estado y destino | `GET …/completeness` / `CaseView.completeness` → `items[].status`, `destination.entity` | ✓ `apps/clinical-api/openapi.yaml` |
| Vista de caso | `GET …/case` → `CaseView.timeline`, `priorTreatments`, `attributes`, `biomarkerSeries` | ✓ (contrato congelado) |
| Registrar biomarcador / diagnóstico | `POST …/biomarkers`, `POST …/diagnoses` | ✓ (contrato congelado, US-033 AC-10) |
| Seguimiento | `POST/GET …/evidence-analyses/{id}/follow-ups`, `FollowUpTurn` | ✓ (US-033 AC-13) |
| Atributos y tratamientos previos | `POST/GET …/clinical-attributes`, `POST …/prior-treatments` | ✗ **falta en el openapi** → tarea `## contratos` de US-094 (aditivo, ADR-26) |
| Corregir biomarcador, examen, nota | endpoint de corrección + `supersedesId` / estado `reemplazado` en la lectura | ✗ **falta** → tarea `## contratos` de US-253 y migración aditiva (propuesta D-2) |
| Origen «Corrección manual» | `entryMethod = manual_correction` | ✓ enum en el esquema |
| Histórico de un dato | lectura con `reviewStatus = reemplazado` enlazado | ✗ → US-253 (D-2) |
| Notas clínicas en la ficha | `ClinicalNote` en `PatientSummary` | ✗ → US-253 (`## contratos`, aditivo) |

## Revisiones

- **Gate 1 del S5 (2026-11-03, `[S5 resp. 11]`):** eventos de IA en el timeline «Generado por IA · Sin verificar»; origen OCR «Documento»; semilla «Carga inicial»; enlace del aviso de faltantes del panel «Ir a ‹etiqueta› en el caso clínico» (lleva a `#datos-criticos` de la vista de caso); fechas relativas en ficha y vista de caso; una cita textual de la guía solo se muestra atribuida («Según ‹fuente›: «…»», con enlace al fragmento). La columna «Datos críticos» lee `/completeness` (etiqueta, destino y origen), no `CaseView.completeness`.

- `clinical-language-auditor` (modo Diseño, 2026-11-03): **PASS**, 0 bloqueantes; aplicados los 2 Mayores (citas solo del corpus y metadatos del catálogo en cada respuesta de seguimiento; «Completar diagnóstico a mano» para que no parezca que lo completa la IA, AC-T3.2) y los Menores 3, 4, 5, 7 y 8. La pregunta 6 (redacción única del aviso RN-19) se resuelve leyendo el texto de configuración, como ya hace `AiDisclaimer`. Detalle en [`S5-refinamiento.md`](../../../backlog/sprints/S5-refinamiento.md).
- Accesibilidad: los criterios de §4 del sistema de diseño aplican sin excepción; los diálogos de S5-03 son el único patrón nuevo de foco (atrapado, `Esc`, retorno al disparador).
