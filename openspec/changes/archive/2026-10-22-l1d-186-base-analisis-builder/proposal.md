# Proposal — l1d-186-base-analisis-builder

## Trazabilidad

L1D-186 · US-066 · FEAT-T2a (L1D-36) · Sprint 2 · Estimación **5** · HU-20 · FR-27 incisos (a), (d), (e), (f) y
afirmaciones omitidas · FR-10 (omitidas) · RN-02, RN-06, RN-07, RN-10, RN-21 · AC-T2.1 (parte S1), AC-T2.2
(determinismo), AC-T2.3, AC-T2.4 (persistencia) · readme §4.1 `AnalysisBasis`, OL-03, OL-04 ·
US-066 AC-1…AC-6 · Refinamiento `backlog/sprints/S2-refinamiento.md` (DoR ✓, sin decisiones abiertas) ·
🔗 Consumida por: US-067 (panel, change `l1d-187-panel-base-analisis`) · 🔗 Produce para: US-128 (inciso b, S3/S4),
US-129, US-130 (`si-hay-capacidad`) · 🔗 Regresión [RN-10] → US-046 (salida nueva con etiquetas de datos del
paciente).

> **Dependencia hacia adelante (slicing v2):** las etiquetas de procedencia por dato extraído (US-065) llegan en el
> S3. En el S2 el contexto solo lleva datos `seed` verificados o insertados por el test; el inciso (a) los lista con
> los dos ejes que ya trae `Provenance` (`reviewStatus`, `conflict`).

## Why

En el S1 la Base del análisis viaja con la forma final del contrato, pero la arma un adaptador mínimo
(`crearBaseDelAnalisisS1`, `analysis-basis.ts`) que deja `patientDataUsed = []` y compensa con un supuesto fijo
(`ANALYSIS_BASIS_S1_ASSUMPTION_TEXT`, `[S1 resp. 30]`) para que las listas vacías no se lean como "no se usaron
datos". El oncólogo necesita saber, en **todo** análisis —también en "sin evidencia"— con qué datos de su paciente se
hizo, dónde se buscó, qué fuentes no están en el corpus y hasta qué fecha llega (P12: confianza = trazabilidad +
contexto + incertidumbre).

## What Changes

- **`AnalysisBasisBuilder` determinista del S2** en el módulo `evidence-analysis` de `clinical-api`, que sustituye
  en la raíz de composición al adaptador del S1 **sin tocar el service** (el puerto `AnalysisBasisBuilder` de
  `ports.ts` ya existe):
  - (a) `patientDataUsed`: una entrada por dato del contexto clínico **desidentificado** enviado a Backend 2
    (diagnóstico, biomarcadores, atributos, tratamientos previos, eventos), en el orden de sus `dataRef`, con una
    etiqueta **verbalizada de forma determinista** (`verbalizarDatoDelContexto()`, p. ej. "HER2 3+ (IHQ)") y los
    ejes `reviewStatus` y `conflict` copiados de su `provenance`. Nunca identidad (RN-10). Los datos `rechazado` o
    `reemplazado` no aparecen porque nunca entran al contexto (RN-07).
  - (d) `sourcesConsulted`: `selected` (orden del contrato), `filters` (iguales a los del request), `retrieved` y
    `aboveThreshold` (iguales a `retrievalStats`).
  - (e) `sourcesNotIncluded` desde `meta.excludedSources` (copia de `CorpusRelease.excluded_sources`).
  - (f) `corpusCutoffDate` desde `meta.corpusCutoffDate`.
  - `omittedClaims` desde la respuesta interna.
  - Incisos (b), (g), (h), (i) con la forma final y vacíos (`missingCriticalData`, `limitations` del builder,
    `priorAnalysesUsed`, `agentSteps`), salvo lo que ya traiga validado la respuesta interna (`limitations`
    estructurales o verificadas).
  - (c) `assumptions`: **un supuesto declarado** `{ text: "Los faltantes críticos aún no se calculan en esta versión", origin: "regla_catalogo" }`
    mientras los faltantes no se calculen (US-128, S3/S4), para que `missingCriticalData = []` no se lea como
    "no falta nada" (Gate 1 del S2); después, las verificadas que traiga la respuesta interna. US-128 lo retira.
- **Sustitución del supuesto fijo del S1:** el texto de `[S1 resp. 30]` (configurable) deja de emitirse y lo
  reemplaza el supuesto declarado, constante en el builder. La clave `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT` deja de
  leerse en `config.ts`; su retiro de los `.env.example` y del Compose queda como pendiente (ver design, Open Questions).
- **Persistencia idéntica** (RN-06): el `analysis_basis` del `AIAnalysisRecord` es exactamente el `analysisBasis`
  de la respuesta (ya lo garantiza el cierre de L1D-104; este change lo verifica con datos reales en la Base).
- **Sin cambios de contrato:** `AnalysisBasis` está congelado y completo en `apps/clinical-api/openapi.yaml`.

## Capabilities

### New Capabilities

- `analysis-basis`: Base del análisis (FR-27) construida de forma determinista en `clinical-api`. Es una capacidad
  listada en `openspec/config.yaml` que aún no existe en `openspec/specs/`; este change la crea con los incisos del
  S1 y la amplían US-128/US-129/US-130.

### Modified Capabilities

- Ninguna. El requisito de persistencia del registro (`evidence-analysis-gateway`, "Contenido trazable del registro
  del análisis") no cambia: este change añade la igualdad byte a byte de la Base como requisito de `analysis-basis`.

## Bounded contexts

- **clinical-platform** (único): `apps/clinical-api/src/modules/evidence-analysis/`.
- No toca `ai-services`: `rag-orchestrator` ya devuelve `meta.excludedSources`, `meta.corpusCutoffDate`,
  `retrievalStats` y `omittedClaims` (L1D-106, L1D-275, L1D-180). Tampoco `frontend` (lo consume L1D-187).

## Dependencias

- ↪ **Depende de** (ya en `main`): L1D-103 (gateway y contexto clínico con `provenance`), L1D-104 (cierre y
  persistencia antes de responder), L1D-106 (`retrievalStats`, sin evidencia), L1D-114 (`CorpusRelease`),
  L1D-275 (`meta` completo), L1D-180 (`omittedClaims` > 0), L1D-203 (desidentificación).
- ↪ US-065 (procedencia etiquetada, S3): no bloquea; amplía las etiquetas cuando entren datos extraídos.
- 🔗 **Consumido por** `l1d-187-panel-base-analisis` (US-067), que puede desarrollarse en paralelo con las respuestas
  fijas de `contracts/examples/` y mergea después.
- 🔗 **Relacionado** con `l1d-173-tipos-cancer-habilitados` (US-043, tipo no habilitado): esa rama no llama a Backend 2; su Base
  la arma ese change, con el inciso (a) vacío (`patientDataUsed = []`) y (d) con 0 recuperados.

## Fuera de alcance

- Inciso (b) faltantes y "Continuar con aviso" (US-128, S3/S4); supuestos (c) y limitaciones (g) generados por
  reglas (US-129, US-130, `si-hay-capacidad`); análisis previos (h) y búsqueda complementaria (i) (Post-MVP).
- Etiquetas de procedencia de datos extraídos (US-065, S3).
- La UI de la Base (US-067, `l1d-187-panel-base-analisis`).
- La rama `tipo_no_habilitado` del gateway (US-043, `l1d-173-tipos-cancer-habilitados`).

## Impact

- Código: `apps/clinical-api/src/modules/evidence-analysis/{analysis-basis.ts, evidence-analysis.module.ts}` y un
  archivo nuevo de verbalización; `src/config.ts` (deja de leer una clave). Tests en
  `apps/clinical-api/tests/{unit,integration/evidence-analysis}/`.
- Contratos: ninguno; respuestas validadas contra el spec del proveedor.
- Evaluación: no cambia modelo, prompt, umbral, catálogo ni corpus → sin `evaluate`.
- Datos: solo seed sintético y FX-T1a-a (filas insertadas por el test).
