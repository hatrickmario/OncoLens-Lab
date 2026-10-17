# Design — l1d-140-panel-opcion-citas

## Context

Pantalla de referencia: `docs/ux/S1/pantallas-s1.md` § S1-08/09 (formulario, resultado con una opción,
columna "Fragmento citado", estados del S1, accesibilidad y mapeo dato → contrato), sobre el sistema de
diseño del Pre-S1 (`docs/ux/sistema-de-diseno.md`, dirección C, componentes §2 y patrones normativos §3)
y el flujo `docs/ux/flujo-e2e.md` (pantallas 08 y 09, variante S1–S4). Contrato:
`apps/clinical-api/openapi.yaml` (`EvidenceAnalysisRequest`, `EvidenceAnalysis`, schemas compartidos de
`contracts/schemas/evidence.yaml`), congelado en US-033. Sin desviaciones del diseño, salvo las que ya
fija `pantallas-s1.md` (chip con borde `--color-control-border`, no el `#9DBBDB` del prototipo).

Decisiones del usuario que aplican: `[S1 resp. 4]` (ruta `/pacientes/[id]/analisis`, resultado en la
misma página tras el POST), `[S1 resp. 8]` (sin traducción de citas), `[S1 resp. 3]` (supuestos
aceptados), `[§15 resp. 7]` (texto del criterio S1–S4, cuyo literal sustituye `[S1 resp. 28]`).

Validación clínica de los oncólogos asesores (`backlog/sprints/S1-plan.md` §7, 2026-10-14):
`[S1 resp. 28]` (rótulos de la relevancia y del criterio, D3–D4), `[S1 resp. 29]` (auditoría de
descartes en la UI, D6), `[S1 resp. 31]` (reintentar tras un error, D2), `[S1 resp. 32]` (literal del
aviso que se compone de L1D-194, D8), `[S1 resp. 35]` (estado "Análisis no realizado", D2) y
`[S1 resp. 36]` (pregunta de prueba de la UI, `## Contratos`). Los literales nuevos de este change dan
cero coincidencias en los niveles A y B de la lista 1.3.0 de L1D-193 (casos de conformidad de ese
change). `docs/ux/S1/pantallas-s1.md` conserva los literales anteriores: lo corrige la sesión principal;
manda este change.

## Goals / Non-Goals

**Goals:** los seis AC de US-061 en la UI; textos literales fijados por los AC ("Opciones descritas en la
evidencia", "Relevancia de recuperación de evidencia" `[S1 resp. 28]`, "Descartadas por falta de soporte —
solo para revisión", el texto del criterio de `[S1 resp. 28]`); auditoría mínima de descartes
`[S1 resp. 29]`; reintentar tras un error `[S1 resp. 31]`; estado "Análisis no realizado" `[S1 resp. 35]`; marca `data-origen="corpus"` solo en hojas de la allowlist de L1D-193; composición de
`AiDisclaimer` de L1D-194; estados mínimos `sin_evidencia` y error del diseño S1-08/09 con escenarios.

**Non-Goals:** ver `proposal.md`, Fuera de alcance. En particular, sin `warnings` por tarjeta, sin
aplicabilidad y sin estados completos de US-062.

## Decisions

### D1 · Una página RSC con un único contenedor cliente

- `page.tsx` (RSC) lee `params.id`, valida que es UUID (si no, `notFound()`) y renderiza
  `EvidencePanelTemplate` con la barra "Paciente · ID [8 caracteres]" y `<EvidencePanel patientId>`.
  No llama a la ficha (no existe en el S1). La sesión la garantiza `proxy.ts` de L1D-197.
- `EvidencePanel` (`'use client'`) es el único estado del panel: pregunta, petición en curso, resultado
  (o error) y cita con fragmento abierto. El resultado aparece debajo del formulario en la misma página;
  no hay navegación ni URL propia `[S1 resp. 4]`.
- La petición es una función simple `solicitarAnalisis(body)` en `lib/evidence/solicitar-analisis.ts`:
  `fetch('/api/evidence-analyses', { method: 'POST', credentials: 'same-origin' })`, valida el cuerpo
  con el Zod generado de `EvidenceAnalysisRequest` antes de enviar y la respuesta `200` con el de
  `EvidenceAnalysis`; un `4xx/5xx` (salvo `401`) devuelve `{ tipo: 'error', httpStatus, codigo, traceId }`:
  el `message` del cuerpo se descarta y `codigo` solo conserva el `error` si pertenece al conjunto cerrado
  `CODIGOS_CON_ESTADO_PROPIO = ['TIPO_CANCER_NO_REGISTRADO']` (si no, `null`); se usa para elegir el
  estado, nunca se muestra. `401` → `router.replace('/login')`.
- **Reintentar `[S1 resp. 31]`:** `EvidencePanel` guarda el último cuerpo enviado; tras un error con
  "Reintentar", vuelve a llamar a `solicitarAnalisis(ultimoCuerpo)` como petición **nueva** (sin estado
  compartido con la anterior, sin `Idempotency-Key` en el S1, `[S1 resp. 21]`), sin navegar ni tocar la
  sesión. El `textarea` es controlado y conserva la pregunta en todo error y en `no_realizado`. No es un hook: tiene un solo consumidor (YAGNI).
- `sourcesSelected = { guias: true, ensayos: true, publicaciones: true }` como constante con nombre
  `FUENTES_POR_DEFECTO_S1` (desaparece con los selectores del S3).
- Alternativa descartada en una línea: Server Action (prohibida por readme §2.1; el análisis va por
  Route Handler); RSC con `searchParams` y GET (el contrato no tiene GET del análisis).

### D2 · Clasificación del resultado como regla con nombre

`clasificarResultado(respuesta)` (puro, `lib/evidence/clasificar-resultado.ts`) devuelve:

| Clase | Condición | Render |
|---|---|---|
| `con_opciones` | `status = con_evidencia`, `evidenceOptions.length ≥ 1` | encabezado, criterio, tarjetas (itera el arreglo; en el S1 llega 1) y descartadas si las hay |
| `solo_descartadas` | `con_evidencia`, `evidenceOptions = []`, `discardedOptions ≥ 1` | frase "No hay opciones descritas con soporte verificable en la evidencia recuperada." + `DiscardedOptions` |
| `sin_opciones` | `con_evidencia`, ambos vacíos | "La evidencia recuperada no describe opciones para esta pregunta."; sin encabezado ni descartadas (AC-5) |
| `sin_evidencia` | `status = sin_evidencia` | mínimo del S1: frase del diseño y "Relevancia máxima: no aplica" (nunca 0, RN-02) |
| `no_soportado` | otro `status` (p. ej. `tipo_no_habilitado`) | mismo mínimo que error, sin detalles |

El `422` con `codigo = TIPO_CANCER_NO_REGISTRADO` es la clase **`no_realizado`** `[S1 resp. 35]`: un caso
sin tipo de cáncer no es "sin evidencia". Muestra solo "Análisis no realizado: falta el tipo de cáncer; no
fue posible filtrar la evidencia." (`evidence.noRealizado.sinTipoCancer`), sin aviso de IA (no hay
análisis: `clinical-api` no generó ni persistió nada), sin "Relevancia máxima", sin código de traza (no es
un error técnico) y sin "Reintentar" (la misma petición daría el mismo resultado; el formulario conserva la
pregunta). La regla pura `clasificarFallo(httpStatus, codigo)` (`lib/evidence/clasificar-fallo.ts`)
devuelve `no_realizado` o `error`.

El error de transporte (`{ tipo: 'error', httpStatus, codigo, traceId }`, salvo `no_realizado`) se
renderiza con el mínimo del S1:
el mensaje lo elige la regla pura `mensajeDeError(httpStatus)` (claves `evidence.error.*`) y siempre va
seguido de "Código de traza: [traceId]", sin aviso de IA, sin resultado parcial (RN-06) y sin detalles
internos (ni `message` ni `error` de la respuesta):

| `httpStatus` | Clave | Texto |
|---|---|---|
| `503` (`LOCAL_LLM_UNAVAILABLE`, `[S1 resp. 12]`) | `evidence.error.modeloNoDisponible` | "El modelo local no está disponible. No se muestra ningún resultado parcial." |
| `504` (`DEADLINE_VENCIDO`, US-053 AC-3) | `evidence.error.tiempoAgotado` | "El análisis superó el tiempo máximo de espera. No se muestra ningún resultado parcial." |
| `502` y cualquier otro `4xx/5xx` salvo `401` y `no_realizado` | `evidence.error.generico` | "No se pudo completar el análisis. No se muestra ningún resultado parcial." |

Debajo del mensaje y del código de traza, el botón "Reintentar" (`evidence.error.reintentar`)
`[S1 resp. 31]`; el error técnico queda registrado con su `traceId` en `clinical-api` (L1D-104), no en
`web`.

Los mínimos `sin_evidencia` y error son diseño de S1-08/09; se
declaran como escenarios del spec (`[pantallas-s1 S1-08/09]`, corrección del Gate 1); el estado completo
es de US-062 (S3). `no_soportado` (`tipo_no_habilitado`) no tiene camino en el S1: Regresión [RN-19]
activa desde S2 (US-043), donde deberá mostrar el aviso de IA.

### D3 · Criterio de selección elegido por la respuesta (RN-28)

`elegirCriterioDeOrden(analisis)` (puro, `lib/evidence/criterio-de-orden.ts`) devuelve la clave i18n
`evidence.orderCriterion.relevance` cuando `applicability = []`; su valor es exactamente "Ordenado por
relevancia de recuperación de la búsqueda; no representa prioridad ni aplicabilidad clínica."
`[S1 resp. 28]` (sustituye a "Seleccionada por relevancia de la búsqueda, no por eficacia…"). En el S1 es la única rama; la de
aplicabilidad la añade US-126 AC-7 (Regresión [RN-28] activa desde S5). Con `applicability` no vacío
en el S1 también devuelve la clave neutra: el panel nunca afirma un orden por aplicabilidad que no
construye. El literal vive en `apps/web/messages/es.json`, no en código. **Nota:** esta función es una
heurística provisional; US-126 AC-7 la sustituirá por un campo del contrato que declare el criterio
aplicado (RN-28), y entonces el panel solo lo traduce.

### D4 · Relevancia como metadato secundario (RN-03)

- `RelevanceMeta` se renderiza **después** de las citas, al final de la tarjeta, en 12 px y color
  `#44506A` (8,07:1): rótulo exactamente "Relevancia de recuperación de evidencia"
  (`data-testid="relevance-label"`, `evidence.relevance.label`) + valor (`data-testid="relevance-value"`)
  + presentación del valor "Orden basado en la cita recuperada más relevante asociada a cada opción"
  (`relevance-basis`, `evidence.relevance.basis`) + nota "Metadato secundario: no mide eficacia ni solidez
  clínica" (`evidence.relevance.note`) + ayuda "No resume la aplicabilidad, la eficacia ni la calidad
  global de la opción." (`relevance-help`, `evidence.relevance.help`, enlazada al valor por
  `aria-describedby`) `[S1 resp. 28]`. Sin barra, estrella ni porcentaje. La presentación es solo texto:
  el panel no recalcula `relevanceScore` (lo fija el contrato).
- `formatearRelevancia(valor)` (puro): `Intl.NumberFormat('es', { minimumFractionDigits: 2,
  maximumFractionDigits: 2 })` → `0,87`. `null` → "no aplica" (no ocurre en `EvidenceOption`, donde
  el contrato lo exige numérico, pero la función respeta `null ≠ 0`).
- AC-2 se verifica sobre el rótulo (`relevance-label`), la presentación y la ayuda (igualdad exacta); ningún
  rótulo de la tarjeta es "Evidencia" a secas ni el literal anterior "Relevancia de la evidencia"; la nota
  y la ayuda negadas **están permitidas** (corrección del Gate 1, `[S1 resp. 28]`). El literal de US-061
  AC-2 en el Markdown del backlog lo corrige la sesión principal.

### D5 · Citas, fragmento y procedencia (RN-04, RN-25)

- `CitationChip` (`button` con `aria-expanded`/`aria-controls`) muestra `sourceName` · `externalId`; al
  expandirlo, `CitationDetails` lista `title` (con `lang` = `language`), `authors`, `studyDesign`,
  `publishedAt` / `lastUpdatedAt`, `language`, `licenseClass` como texto i18n ("Dominio público",
  "CC BY"…), "Ver fragmento" y "Fuente original".
- `valorONoDisponible(valor)` (puro): `null`/`undefined`/cadena vacía → "No disponible"; nunca se omite
  ni se rellena el campo (RN-25).
- "Ver fragmento" abre `CitedFragment` en el `aside` "Fragmento citado": `chunkTextSnapshot` en su idioma
  original, `lang` BCP 47, sin traducción `[S1 resp. 8]`; el foco va al encabezado (`tabindex="-1"`) y
  "Volver a la cita" lo devuelve al chip de origen. Sin fragmento abierto, la ayuda del diseño.
- **`data-origen="corpus"` + `data-campo="<campo>"`** solo en **nodos hoja** (un `<span>` sin elementos
  hijos) cuyo texto es copia literal de un campo de `CAMPOS_COPIADOS_DEL_CORPUS` de
  `packages/clinical-language` (L1D-193): `chunkTextSnapshot`, `title`, `sourceName`, `externalId`,
  `authors` (cuando hay valor). Nunca en contenedores (chip, tarjeta, `aside`) ni en nodos con texto
  generado (`option`, `rationale`, `unsupportedClaims`) o de la UI (rótulos, "No disponible", texto i18n
  de la licencia). Los `aria-label` de esos nodos son texto de la UI y pasan el recorrido.
- `sourceUrl`: enlace solo si `esUrlHttpSegura(url)` (protocolo `https:`; `http:` solo en
  `localhost`/`*.test`); si no, "No disponible". `target="_blank"` con `rel="noopener noreferrer"`.

### D6 · Descartadas (FR-10, AC-10.4)

`DiscardedOptions` sobre `collapsible` de shadcn, **plegado** por defecto, título exacto "Descartadas
por falta de soporte — solo para revisión" y la línea "No son opciones descritas: se muestran solo para
revisión.". Al expandir: `option`, motivo (`discardReason` → `evidence.discardReason.<enum>` con los
cuatro textos de `pantallas-s1.md`; `afirmacion_sin_soporte` = "Una afirmación no tiene soporte en la
fuente o contenía lenguaje no permitido", porque L1D-180 usa ese motivo también para el texto retirado
por RN-23, `[S1 resp. 16]`) y cada `unsupportedClaims[]` resaltada con el rótulo "Sin soporte"
(texto + símbolo, `#8E1F18` sobre `#F9E3E1`). Ningún botón, enlace ni control de vínculo. El texto de
la descartada es salida generada (no corpus): no lleva `data-origen`.

**Auditoría mínima `[S1 resp. 29]`** (sin cambio de contrato): cada descartada lleva una línea de
metadatos `DiscardedAuditMeta` con "N.º [posición desde 1]" · "Análisis [`id`]" (completo) · "[`createdAt`]"
(ISO 8601 tal cual llega) y, al inicio de la sección, "Registro solo para auditoría: no es contenido
clínico utilizable." (`evidence.discarded.auditoria`). La descartada nunca usa `EvidenceOptionCard` ni su
estilo. La frase retirada, el `ruleId`, la versión de la política y los `chunkIds` **no** se muestran: el
log de `rag-orchestrator` (L1D-180) registra `ruleId` y versión, y la traza completa es un AC nuevo de
US-150 (FEAT-T1b, S6) con su cambio de contrato y de esquema.

### D7 · Accesibilidad (NFR-12)

- `textarea` con `<label>` "Pregunta clínica"; ayuda y contador por `aria-describedby`; contador sin
  anuncio hasta 1900 caracteres; `maxLength` 2000 del contrato.
- Botón `<button type="submit">` "Analizar evidencia"; Enter en el botón envía; mientras espera
  `aria-disabled="true"` (no `disabled`) y "Analizando…"; un segundo envío en curso se ignora.
- Región `role="status"` (`aria-live="polite"`) breve **fuera** del resultado: "Analizando…" →
  "Análisis listo: [n] opción descrita" / "Sin evidencia sobre el umbral" / "No se pudo completar el
  análisis. Código de traza [traceId]" / "Análisis no realizado: falta el tipo de cáncer". Tras
  "Reintentar", el anuncio vuelve a "Analizando…" y el foco queda en el botón (o pasa al botón de envío si
  "Reintentar" desaparece con el resultado). El contenedor del resultado no es *live*; el foco no salta.
- Orden de foco, anillo `--color-primary` (blanco sobre navy), objetivos ≥ 44 px y `overflow-wrap:
  anywhere` en `externalId` y URL, según `pantallas-s1.md` § Accesibilidad.

### D8 · Aviso de IA y cabecera: se componen, no se crean (RN-19)

El texto del aviso es el de `[S1 resp. 32]` ("Generado por IA; requiere validación clínica independiente
por el oncólogo tratante."), que llega en `disclaimer`; `web` no lo declara. `AiDisclaimer` (molécula RSC,
prop `text`) y `AppHeader` (marca y etiqueta "Uso académico/investigación"
en `app/(dashboard)/layout.tsx`) los crea `l1d-194-aviso-ia-etiqueta-academica`. Este change **no los
crea ni los duplica**: `AnalysisResult` compone `<AiDisclaimer text={analisis.disclaimer} />` en dos
posiciones (antes del `h2` y en el pie) en las clases `con_opciones`, `solo_descartadas`, `sin_opciones` y
`sin_evidencia` (nunca en `no_realizado` ni en error), con el campo `disclaimer` tal cual llega (sin texto propio de `web`). La página hereda la
cabecera del layout `(dashboard)`; la plantilla del panel añade solo la barra "Paciente · ID".

## Privacidad y ownership

- **Fronteras:** navegador → `web` (`POST /api/evidence-analyses`, mismo origen, cookie
  `oncolens_session` HttpOnly) → `clinical-api` (Route Handler de L1D-139) → `rag-orchestrator` (JWT de
  servicio, L1D-105). Este change solo añade el tramo navegador → `/api/*`. El cuerpo lleva `patientId`
  (UUID), `query` (texto libre del oncólogo) y `sourcesSelected`; la desidentificación de `query` y del
  contexto la hace `clinical-api` (RN-11, L1D-203). La ayuda del formulario pide no escribir nombres ni
  documentos.
- **Identidad:** el panel no muestra ni pide identidad ni PHI: solo el UUID abreviado de la ruta.
  `patientId` va en el cuerpo, no en query string; la URL `/pacientes/[id]/analisis` lleva solo el UUID.
- **rag-orchestrator** no se toca; no accede a datos clínicos ni a `clinical-minio`.
- **Logs:** `web` no registra la pregunta, la respuesta ni el fragmento; solo el `traceId` en el error.
- **Datos:** solo sintéticos (seed de L1D-169 y ejemplos de `contracts/examples/`; RN-13, RN-14).

### Seguridad web

- Validación con el **schema Zod generado** de `EvidenceAnalysisRequest` en el cliente (comodidad, no
  seguridad); el Route Handler de L1D-139 **no** revalida con Zod (verifica `Origin` y reenvía), y la
  validación autoritativa es la de `clinical-api` en su borde.
- Sin variables `NEXT_PUBLIC_` nuevas; la URL interna de `clinical-api` nunca llega al cliente (US-060
  AC-5). `solicitarAnalisis` solo usa la ruta relativa `/api/evidence-analyses`.
- **Texto del LLM y del corpus** (`option`, `rationale`, `unsupportedClaims`, `chunkTextSnapshot`,
  metadatos): siempre como nodos de texto de React; prohibido `dangerouslySetInnerHTML` y cualquier
  render de Markdown/HTML. `sourceUrl` filtrado por `esUrlHttpSegura()` (sin `javascript:` ni `data:`).
  El chunk de inyección de FX-06a-a (`</document>`) se muestra como texto literal.
- Sin cambios de CSP ni cabeceras; sin estilos ni scripts inline nuevos; enlaces externos con
  `rel="noopener noreferrer"`.
- Módulos `server-only`: ninguno nuevo (el panel no lee secretos). Dependencias nuevas: componente
  `collapsible` de shadcn/ui (código copiado al repo; su dependencia `@radix-ui/react-collapsible` en
  versión exacta, con `npm audit` sin vulnerabilidades altas en el PR).

## Componentes y patrones

| Nivel | Componente (archivo en `apps/web/components/`) | RSC / cliente | Concepto |
|---|---|---|---|
| Molécula | `molecules/relevance-meta.tsx` | RSC-compatible | rótulo + valor + nota (RN-03) |
| Molécula | `molecules/citation-chip.tsx` | cliente | botón expandible de la cita |
| Molécula | `molecules/citation-details.tsx` | RSC-compatible | metadatos con "No disponible" |
| Molécula | `molecules/cited-fragment.tsx` | cliente | fragmento original y "Volver a la cita" |
| Organismo | `organisms/ordering-criterion.tsx` | RSC-compatible | texto del criterio |
| Organismo | `organisms/evidence-option-card.tsx` | cliente (contiene chips) | una opción |
| Organismo | `organisms/discarded-options.tsx` | cliente (`collapsible`) | descartadas |
| Molécula | `molecules/discarded-audit-meta.tsx` | RSC-compatible | n.º, id y `createdAt` de una descartada `[S1 resp. 29]` |
| Molécula | `molecules/analysis-failure.tsx` | cliente | mensaje de error o `no_realizado` y "Reintentar" `[S1 resp. 31]` `[S1 resp. 35]` |
| Organismo | `organisms/analysis-result.tsx` | cliente | despacha por `clasificarResultado` |
| Organismo | `organisms/evidence-query-form.tsx` | cliente | textarea, contador y botón |
| Organismo | `organisms/evidence-panel.tsx` | `'use client'` (frontera) | estado y petición |
| Plantilla | `templates/evidence-panel-template.tsx` | RSC | layout C, barra del paciente, `aside` |

- Límite de 100 líneas de alerta / 150 duras por componente: si `evidence-option-card.tsx` lo supera se
  extrae `CitationList`.
- **Patrones:** ninguno. El estado de "fragmento abierto" se eleva a `EvidencePanel` y baja por props
  (`EvidencePanel → AnalysisResult → EvidenceOptionCard → CitationChip`: dos intermediarios, por debajo
  del umbral de ≥3 niveles para un provider). Sin custom hook (un consumidor), sin compound components.
- La frontera `'use client'` se monta en `EvidencePanel`; `page.tsx` y la plantilla siguen como RSC.

## Dependencias y colaboradores

| Módulo | Nuevo / modifica | Depende de | Reglas extraídas |
|---|---|---|---|
| `app/(dashboard)/pacientes/[id]/analisis/page.tsx` | nuevo | plantilla, `EvidencePanel` | validación UUID de la ruta |
| `lib/evidence/solicitar-analisis.ts` | nuevo | `fetch`, Zod generado (`packages/api-contracts`) | `solicitarAnalisis()` |
| `lib/evidence/clasificar-resultado.ts` | nuevo | tipos generados | `clasificarResultado()` (AC-4, AC-5, RN-02) |
| `lib/evidence/criterio-de-orden.ts` | nuevo | tipos generados | `elegirCriterioDeOrden()` (RN-28) |
| `lib/evidence/clasificar-fallo.ts` | nuevo | — | `clasificarFallo()` (`no_realizado` / `error`, `[S1 resp. 35]`), `mensajeDeError()` |
| `lib/evidence/formatear-relevancia.ts` | nuevo | `Intl` | `formatearRelevancia()` (RN-03) |
| `lib/evidence/procedencia.ts` | nuevo | — | `valorONoDisponible()` (RN-25), `esUrlHttpSegura()` |
| `messages/es.json` | modifica (lo crea L1D-197) | — | claves `evidence.*` |
| `components/**` (tabla anterior) | nuevos | `lib/evidence/*`, `components/ui/*` | — |
| `contracts/examples/*` + `index.json` | nuevos / modifica | specs de ambos proveedores | — |

Los tipos de `EvidenceAnalysis` se importan de `packages/api-contracts` (generado); ningún tipo se
declara a mano.

## Contratos

- **Proveedor:** `clinical-api` (`POST /platform/evidence-analyses`, re-expuesto tal cual por el Route
  Handler de L1D-139); `rag-orchestrator` para los ejemplos del modo falso. **Consumidor:** `web`.
- **Diff del `openapi.yaml`: ninguno.** Sin cambio incompatible (oasdiff vacío), compatible con ADR-26.
- **Ejemplos nuevos** (sintéticos, sin NCCN/ESMO salvo en `sourcesNotIncluded`, `disclaimer` con el
  literal de `[S1 resp. 32]`, "Generado por IA; requiere validación clínica independiente por el oncólogo
  tratante."), registrados en `contracts/examples/index.json`:

| Archivo | `spec` · `target` | Contenido | Uso |
|---|---|---|---|
| `con-evidencia-solo-descartadas.json` | clinical-api · `#/components/schemas/EvidenceAnalysis` | `con_evidencia`, `queryText` = pregunta de prueba de `[S1 resp. 36]`, `id` y `createdAt` fijos (AC de auditoría, `[S1 resp. 29]`), `evidenceOptions = []`, una descartada `afirmacion_sin_soporte` con `unsupportedClaims = ["reduce la mortalidad a la mitad"]` (FX-06a-b `LLM-SIN-SOPORTE`) | MSW, AC-4 |
| `con-evidencia-sin-opciones.json` | clinical-api · `EvidenceAnalysis` | `con_evidencia`, `queryText` = `Q-TOX`, ambos arreglos vacíos, `topRelevanceScore` 0.6 | MSW, AC-5 |
| `rag-query-request-solo-descartadas.json` | rag-orchestrator · request de `/rag/query` | pregunta de prueba de la UI `[S1 resp. 36]`: "En pacientes con cáncer de mama HER2 positivo temprano, ¿qué describe la evidencia sobre mortalidad con terapia anti-HER2 adyuvante?" (sustituye a la de *fixture* asumida) | modo `fake`, E2E AC-4 |
| `rag-query-solo-descartadas.json` | rag-orchestrator · `RagQueryInternalResponse` (request anterior) | par del primero | modo `fake` |
| `rag-query-request-sin-opciones.json` | rag-orchestrator · request | `query` = `Q-TOX` | modo `fake`, E2E AC-5 |
| `rag-query-sin-opciones.json` | rag-orchestrator · `RagQueryInternalResponse` | par del segundo | modo `fake` |
| `error-tipo-cancer-no-registrado.json` | clinical-api · `#/paths/~1platform~1evidence-analyses/post/responses/422` | `{"error":"TIPO_CANCER_NO_REGISTRADO","message":…,"traceId":…}` `[S1 resp. 35]`; **dueño L1D-103** (1.2.0, que añade el `422` al spec): este change solo lo crea si no está en `main` al empezar, y lo avisa al orquestador | MSW, estado `no_realizado` |

- AC-1, AC-2, AC-3 usan los ejemplos existentes `con-evidencia-s1.json` (MSW) y
  `rag-query-con-evidencia.json` (E2E, pregunta `Q-HER2` de `rag-query-request.json`); los tests de
  `solicitarAnalisis` usan `evidence-analysis-request.json`, que crea L1D-139 `[S1 resp. 18]`.
- **Orden de merge:** los ejemplos clínicos nuevos llevan el literal de `[S1 resp. 32]`, que solo exige
  `assertDisclaimerRequired` tras L1D-194 (clinical-api 1.3.1, `[S1 resp. 37]`); el commit
  `contract(L1D-140)` se hace con L1D-194 en `main`. El ejemplo del `422` requiere además L1D-103 (1.2.0)
  en `main`, porque valida contra la respuesta `422` que ese change añade; este change no sube
  `info.version` (no edita `openapi.yaml`).
- Los schemas Zod y los tipos son **generados** del spec (`contracts:generate`); no se editan.

## Risks / Trade-offs

- **Literal del AC-1 frente al modo falso (decidido, `[S1 resp. 18]`):** el E2E **lee** `sourceName` y
  `externalId` de `contracts/examples/rag-query-con-evidencia.json` (el que sirve `LLM_PROVIDER=fake`) en
  lugar de fijar "CDR-TEST-001"; FX-06a-a gobierna los tests de `rag-orchestrator`.
- `rag-query-con-evidencia.json` trae `applicability` no vacío: en el E2E el texto del criterio sigue
  siendo el neutro por D3, que es lo que exige el AC-3 en el S1.
- `contracts/examples/index.json` lo tocan varios changes del sprint: conflicto de merge trivial, se
  resuelve conservando todas las entradas.
- **Ejemplo del `422` con dos dueños posibles:** lo crea L1D-103; si este change lo crea antes (porque L1D-103
  no lo trajo), el orquestador lo comunica a L1D-103 para que no lo duplique ni lo renombre.
- El estado `no_realizado` se prueba solo con MSW (componente): el seed sintético del S1 no tiene un paciente
  sin diagnóstico; el E2E llega cuando lo haya (US-062, S3).
- Si L1D-139 no está en `main`, los E2E quedan en rojo en la rama y se cierran en la misma oleada (nunca
  `.skip`); los tests de componente no dependen de él.

## Open Questions

1. ~~AC-1 E2E y `externalId`~~ — resuelta por `[S1 resp. 18]`: se lee del ejemplo.
2. ~~Mínimos `sin_evidencia` y error del S1~~ — resuelta en el Gate 1: escenarios propios en el spec.
3. ~~AC-2 "eficacia"~~ — resuelta en el Gate 1 (rótulo exacto y nota negada permitida); el rótulo pasa a
   "Relevancia de recuperación de evidencia" por `[S1 resp. 28]`. Texto original: rótulo exacto "Relevancia de la evidencia" y nota negada
   permitida.

## Notas para sprints posteriores

- US-126 AC-7 sustituirá la heurística `elegirCriterioDeOrden()` por un campo del contrato que declare el
  criterio de orden aplicado (RN-28).
- Regresión [RN-19] activa desde S2 (US-043): `tipo_no_habilitado` / `no_soportado` debe mostrar el aviso
  de IA.
