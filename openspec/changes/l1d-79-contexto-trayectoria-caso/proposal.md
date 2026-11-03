# Proposal — l1d-79-contexto-trayectoria-caso

## Trazabilidad

L1D-79 · US-093 · FEAT-02b (L1D-10) · Sprint 5 (O2) · Estimación **3** · HU-03, HU-15 · FR-09 (contexto con tendencias
y eventos) · RN-11 · RN-07 · ADR-50 · AC-06.2 (completo) · AC-T4.2 · AC-T4.3 (parte S2) · readme §4.2
(`ClinicalContext`) · US-093 AC-1…AC-5 · `backlog/features/FEAT-02b-vista-de-caso.md` ·
`backlog/sprints/S5-refinamiento.md` §2 (`[S5 resp. 3]`)

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-11-03, refinamiento del S5):** comprometida en el S5 `[S5 resp. 3]`. Sin OCR, los eventos y
  tratamientos vienen del **seed** y del **registro manual**; `biomarkerTrends` viaja **vacío** mientras US-091 no exista.
  Es la segunda en el orden de recorte del S5 (§2: US-071 → **US-093** → …).
- **ADR-50:** una corrección deja la fila anterior `reemplazado`; ninguna lectura la usa. El predicado único de RN-07
  (`sqlDatoVigente()`) excluye `rechazado` y `reemplazado`.
- **ADR-40** (opción A en `clinical-api`): identidad exacta del paciente más los patrones de `config/pii-formats.json`.

## Por qué

AC-06.2 exige que el análisis reciba la trayectoria del caso (eventos, líneas de tratamiento previas, línea actual) con
fechas relativas y sin nada que identifique al paciente (AS-IS P1; JTBD 1 y 7). `ClinicalContextBuilder` (US-052) ya
arma `events`, `priorTreatments`, `attributes` y `currentLine` por allowlist y el desidentificador (US-049) enmascara todo
el texto libre, pero ningún test lo demuestra sobre un caso con trayectoria real (P-CASO), y hay un hueco: un evento con
`date_precision = incierta` y `event_date` informada viaja hoy con `monthsAgo` calculado, cuando la vista de caso
(`l1d-74`) lo trata como «sin fecha confiable».

## Qué cambia

- `clinical-api` (`modules/evidence-analysis`):
  - El repositorio del caso lee también `date_precision` de `clinical_event` y `clinical_attribute`; una regla con nombre
    `fechaConfiable()` devuelve `null` cuando la precisión es `incierta`, de modo que `monthsAgo = null` (AC-5).
  - Sin cambios en la allowlist, en la forma del contexto ni en `lineaActual()` (ya cumple la regla de `currentLine`,
    Decidido (usuario, 2026-11-03), `[S5 resp. 13]`: la mayor línea numerada en curso).
  - Tests de aceptación sobre el payload capturado con **FX-02b-a (P-CASO)** y reloj fijo en 2026-10-01: trayectoria
    (AC-1), descripción enmascarada (AC-2), etiquetas de revisión (AC-3), sin fechas absolutas (AC-4), evento sin fecha
    (AC-5), más la exclusión de `rechazado`/`reemplazado` en la trayectoria (RN-07, ADR-50).
  - Los tratamientos de FX-02b-a usan **códigos ATC reales** (`L02AE02` leuprorelina, `L02BB03` bicalutamida, del
    subconjunto ATC que añade l1d-80) en lugar de `ATC-T-LEUP`; el patrón de `atcCodes` del contrato **no** se relaja
    (`[S5 resp. 10]` (4), `[S5 resp. 9]`).
- Sin cambio de contrato: `ClinicalContext` (`apps/rag-orchestrator/openapi.yaml`) ya declara `events`,
  `priorTreatments`, `currentLine` y `monthsAgo: integer | null`.
- Sin cambio en `rag-orchestrator`: el prompt `rag-query` y el resumen embebido siguen leyendo solo diagnóstico y
  biomarcadores (`datos_del_contexto()`); lo que llega al prompt **no cambia**, así que `run-ai-eval` no aplica.

## Capacidades

- `evidence-analysis-gateway` (ADDED): «La trayectoria del caso viaja en el contexto clínico».
- `deidentification` (ADDED): «La trayectoria del caso sale desidentificada» (amplía, por la regresión anunciada en
  «La pregunta y el texto libre salen enmascarados hacia la IA», el enmascaramiento a eventos y tratamientos de FEAT-02b).

## Bounded contexts

clinical-platform (solo `apps/clinical-api`). Sin ai-services, sin frontend, sin contratos.

## Dependencias

- ↪ **l1d-74-vista-caso-timeline** (US-088, O2): crea el soporte de tests de **FX-02b-a (P-CASO)**
  (`apps/clinical-api/tests/support/caso.ts`). Este change lo reutiliza; si `l1d-74` no ha mergeado cuando arranque, el
  implementador espera o toma la siembra de ese change (no se duplica el fixture).
- ↪ Archivados: US-052 (`ClinicalContextBuilder`, allowlist), US-049 (desidentificador, `verificarDesidentificado()`),
  US-065 (`provenanceDe()`, `sqlDatoVigente()`).
- 🔗 **l1d-113-faltantes-desconocido-prompt** (US-116, O2): sin conflicto de módulo. Ese change toca
  `datos_del_contexto()` y la versión del prompt en `rag-orchestrator`; este no toca `rag-orchestrator`. El aviso de
  conflicto de su proposal queda resuelto: no hay que coordinar el orden de merge ni la versión del prompt.
- 🔗 **l1d-80-tratamientos-atributos-manuales** (US-094) y **l1d-309-correccion-con-historico** (US-253, ADR-50):
  productores de filas manuales y de `reemplazado`; el contexto las lee sin cambios (sin bloquear).
- 🔗 Regresión [RN-11] → US-049 · Regresión [RN-07] → US-065 · Relacionada: US-091 (tendencias, `si-hay-capacidad`).

## Fuera de alcance

- `biomarkerTrends` (US-091, `si-hay-capacidad`): sigue vacío, como exige «Contexto clínico por allowlist explícita».
- Llevar eventos, tratamientos o atributos al **texto del prompt** o al resumen embebido (Non-Goal del S3 en
  `rag_query.py`): sería un cambio de prompt con su `evaluate` y su historia. P-2 Decidido (usuario, 2026-11-03),
  `[S5 resp. 13]`: siguen fuera del prompt en el S5.
- Datos de OCR (Post-MVP, PRD E-17), reconciliación de fuentes (US-099), notas clínicas (siguen vacías).
