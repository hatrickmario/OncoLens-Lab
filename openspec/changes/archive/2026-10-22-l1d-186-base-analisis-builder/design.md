# Design — l1d-186-base-analisis-builder

## Context

Ver `proposal.md`. Hoy `crearBaseDelAnalisisS1()` (`analysis-basis.ts`) implementa el puerto `AnalysisBasisBuilder`
(`ports.ts`) con `patientDataUsed = []` y un supuesto fijo (`[S1 resp. 30]`). El cierre (`analysis-completion.ts`,
L1D-104) llama al builder, persiste el registro y responde (RN-06). El contexto que recibe el builder es el
`RagQueryInternalRequest` ya **desidentificado** (L1D-203), con un `dataRef` opaco y una `provenance`
(`entryMethod`, `extractionConfidence`, `reviewStatus`, `conflict`) por dato.

## Goals / Non-Goals

**Goals:** inciso (a) lleno y determinista; (d), (e), (f) y omitidas fieles a la respuesta interna; misma Base en
la respuesta y en el registro; sustitución del adaptador sin tocar el service.

**Non-Goals:** incisos (b), (c), (g), (h), (i); procedencia etiquetada de datos extraídos (US-065); rama
`tipo_no_habilitado` (L1D-173); UI (L1D-187).

## Decisions

1. **El inciso (a) se arma desde el contexto desidentificado, no desde las filas de la BD.** El builder recorre los
   datos de `request.clinicalContext` (diagnóstico, biomarcadores, atributos, tratamientos previos, eventos) en el
   orden de sus `dataRef`. Así "datos usados" significa exactamente "datos enviados a la IA", la etiqueta no puede
   llevar identidad (el contexto ya no la tiene) y el builder sigue siendo puro (sin repositorio). Descartada: leer
   de nuevo las filas (E/S en un builder puro y riesgo de divergencia con lo enviado).
2. **`verbalizarDatoDelContexto()` como función pura con nombre propio** (`analysis-basis.verbalizacion.ts`). Formato
   por tipo: biomarcador `<name> <value>[ <unit>][ (<método>)]` (p. ej. "HER2 3+ (IHQ)"), diagnóstico
   `<cancerType>[ · <stagingSystem> <stageValue>]`, atributo `<nombre>: <valor>`, tratamiento previo
   `<nombre>[ · línea <n>]`, evento `<tipo>`; fechas solo relativas, como en el contexto. Un campo ausente se omite
   de la etiqueta (no se escribe "No disponible": ese centinela es de RN-25 para metadatos de fuente). Es la misma
   regla de verbalización determinista que pide ADR-34 para las afirmaciones sobre datos del paciente; si Backend 2
   ya expone una, no se duplica en Python: esta vive en Backend 1, dueño del dato.
3. **`reviewStatus` y `conflict` se copian de `provenance`**, sin recalcular. Los `rechazado`/`reemplazado` ya los
   excluye el repositorio (`SIN_RECHAZADOS`, RN-07): el builder no repite el filtro (una regla, un lugar).
4. **Supuesto declarado mientras no haya faltantes (Gate 1 del S2).** El supuesto configurable de `[S1 resp. 30]`
   se retira, pero `missingCriticalData = []` junto con `assumptions = []` se leería como "no falta nada". Mientras
   los faltantes no se calculen (US-128, S3/S4), `assumptions` empieza con el supuesto declarado
   `{ text: "Los faltantes críticos aún no se calculan en esta versión", origin: "regla_catalogo" }` (constante
   `SUPUESTO_FALTANTES_NO_CALCULADOS` en el builder, no configurable), seguido de las verificadas de la respuesta
   interna (`origin = llm_verificado`). US-128 lo retira al calcular el inciso (b). Se adapta US-066 AC-1
   (`assumptions = []` → ese único supuesto). `config.ts` deja de exigir `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT`.
5. **Determinismo por construcción:** sin `Date`, sin IDs, orden de entrada conservado, `selected` en el orden fijo
   del contrato (`guias`, `ensayos`, `publicaciones`). El test AC-4 compara `JSON.stringify` de dos ejecuciones.
6. **Sustitución en la raíz de composición** (`evidence-analysis.module.ts`): `crearBaseDelAnalisis()` reemplaza a
   `crearBaseDelAnalisisS1()`; el service y el cierre no cambian (OCP: el puerto ya existía para esto).

## Privacidad y ownership

- **Fronteras:** el builder corre en `clinical-api` y lee solo la petición interna ya desidentificada y la respuesta
  de `rag-orchestrator`. La Base viaja `clinical-api → web → navegador` y se persiste en `clinical.ai_analysis_record`.
  Nada nuevo cruza hacia `rag-orchestrator`.
- **RN-10/RN-11:** las etiquetas se construyen desde el contexto desidentificado; no contienen identidad, fechas
  absolutas ni `pseudoPatientId` (escenario dedicado). Regresión [RN-10] → US-046 (test de no-fuga con PII sembrada).
- **Logs:** el builder no registra nada; ninguna etiqueta va a los logs.
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio` (sin cambios en Backend 2).

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `analysis-basis.ts` | `crearBaseDelAnalisis()` reemplaza a `crearBaseDelAnalisisS1()`; funciones `fuentesSeleccionadas()`, `datosDelPacienteUsados()`, `supuestosVerificados()` | tipos generados de ambos contratos; puerto `AnalysisBasisBuilder` |
| `analysis-basis.verbalizacion.ts` (nuevo) | `verbalizarDatoDelContexto()` pura | tipos generados de `rag-orchestrator` |
| `evidence-analysis.module.ts` | composición con el builder nuevo | — |
| `src/config.ts` | deja de leer `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT` | — |

Reglas extraídas con nombre propio: `verbalizarDatoDelContexto()` (ADR-34) y `datosDelPacienteUsados()` (FR-27 a).

## Contratos

- **Proveedor:** `clinical-api` (`apps/clinical-api/openapi.yaml`); **consumidor:** `web`. **Sin diff:**
  `AnalysisBasis` ya declara todos los campos con su forma final (US-033). Sin cambios incompatibles (ADR-26).
- Ejemplos: `contracts/examples/con-evidencia-s1.json` y `sin-evidencia.json` ya traen `patientDataUsed` con
  etiquetas; no cambian. Los tests de integración validan cada respuesta contra el spec del proveedor (US-214).

## Risks / Trade-offs

- **Formato de etiqueta no validado clínicamente** → se fija en una función y en unitarios; un cambio posterior es
  local. Los oncólogos lo ven en la demo del S2.
- **Retirar el supuesto fijo del S1** podría dejar sin explicación una Base con listas vacías → el supuesto declarado
  (decisión 4) advierte que los faltantes no se calculan; el panel (L1D-187) lo muestra en el resumen.

## Open Questions

- **Clave `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT`:** retirarla de `.env.example` y del Compose está fuera del permiso de
  este change de planificación; el implementador la retira en el mismo PR (o se anota como deuda) con la aprobación
  del humano.
- **`tipo_no_habilitado` (L1D-173), resuelto en el Gate 1 del S2:** esa rama no llama a Backend 2 y su Base la arma
  `l1d-173-tipos-cancer-habilitados` (D7): inciso (a) **vacío** (`patientDataUsed = []`), (d) con 0 recuperados y 0
  sobre el umbral, (e) desde la configuración de fuentes excluidas y (f) desde `CORPUS_CUTOFF_DATE`. Este change solo
  cubre las ramas que llaman a Backend 2.

## Desviaciones de la implementación

- **Etiquetas:** el contexto desidentificado no trae unidad ni método del biomarcador (el valor ya incluye "(IHQ)"), así que la etiqueta es `<nombre> <valor>`; el resto de formatos sigue la decisión 2. Un campo vacío o "No disponible" se omite (se reutiliza `NO_DISPONIBLE` de `clinical-context.builder.ts`).
- **Orden:** `patientDataUsed` conserva el orden de asignación de los `dataRef` de `construirContextoPermitido()` (diagnóstico, biomarcadores, atributos, tratamientos, eventos); no hay ordenamiento propio del builder (una sola regla de formato `r<n>`, en `asignarDataRefs()`). Las notas clínicas viajan vacías en el S1 (`verificarDesidentificado()` lo exige).
- **Ausentes (RN-25):** ninguna etiqueta sale vacía; un valor ausente se escribe «No disponible» («HER2: No disponible»); el estadio y la línea de tratamiento, que son opcionales, se omiten.
- **Limitaciones:** el builder copia las `limitations` de la respuesta interna (como el adaptador del S1); el escenario AC-1 usa `LLM-OK` sin limitaciones para que `limitations = []`.
- **AC-6:** se verifica en integración (repositorio real + `construirContextoPermitido()` real + builder), porque FX-T1a-a son filas de la BD.
- **Verificación del proveedor:** el helper vigente es `assertMatchesSpec` (`scripts/contracts/lib/responseValidator.mjs`); no existe `contracts:verify-provider` ni `clienteVerificado` en `main`.
- **Clave obsoleta:** `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT` ya no se lee; su retiro de `.env.example` y del Compose queda fuera de este PR.

## Deuda

- Retiro de `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT` de `.env.example`, `docker-compose`, `compose-smoke`, scripts de demo/e2e y tests: PR aparte con aprobación del usuario; historia por crear en `/sprint-close`.

## Preguntas abiertas (para el humano)

1. `limitations` de AC-1: ¿copiar las de la respuesta interna (hoy) o dejar `[]` como dice el AC literal?
2. Etiquetas con códigos internos (`estado_menopausico`, `diagnostico`, `TNM_8`): ¿se traducen en L1D-187 o en el builder?
3. `origin = regla_catalogo` del supuesto declarado: ¿es el origen correcto mientras no exista el cálculo de faltantes?
4. Texto libre de atributos en la etiqueta (ADR-34): hoy se escribe el valor ya enmascarado; ¿se acepta o se verbaliza solo la clave?
