# Design — l1d-79-contexto-trayectoria-caso

## Contexto

`ClinicalContextBuilder` (`apps/clinical-api/src/modules/evidence-analysis/clinical-context.builder.ts`, US-052) ya arma
por allowlist `events` (`eventoPermitido`), `priorTreatments` (`tratamientoPermitido`), `attributes` y `currentLine`
(`lineaActual`), con `provenanceDe()` (US-065) y meses relativos (`mesesTranscurridos`). El repositorio
(`evidence-analysis.repository.ts`) lee las cinco entidades con `sqlDatoVigente()` y excluye del timeline los eventos con
`analysis_id` (RN-24). El desidentificador (`deidentification/context-deidentifier.ts`, US-049) enmascara **toda**
cadena del contexto con el `PiiDetector` del paciente (identidad exacta + `pii-formats.json`, ADR-40 opción A) y
`verificarDesidentificado()` rechaza cualquier fecha absoluta. El prompt de `rag-orchestrator` (`rag_query.py`,
`datos_del_contexto()`) y el resumen embebido solo leen diagnóstico y biomarcadores; la aplicabilidad lee
`priorTreatments` y `attributes`.

Lo que falta para US-093: (1) la regla de fecha no confiable — el repositorio no lee `date_precision`, así que un evento
`incierta` con `event_date` informada viajaría con meses; (2) la evidencia: ningún test recorre el payload de un caso con
trayectoria (P-CASO) ni la PII sembrada en una descripción de evento.

Decisiones del S5 que se respetan: `[S5 resp. 3]` (sin OCR; datos del seed y del registro manual; `biomarkerTrends`
vacío), ADR-50 (lecturas sin `reemplazado`) y D-8 de `l1d-74` (la vista de caso trata `incierta` como «sin fecha»).

## Decisiones

Ninguna es cara de revertir (sin contrato, sin esquema, sin modelos): una recomendación y las descartadas en una línea.

- **D1 · `fechaConfiable(fecha, precision)`** en `clinical-context.builder.ts`: devuelve `null` si `precision = incierta`,
  si no la fecha. `eventoPermitido` y `atributoPermitido` la aplican antes de `mesesTranscurridos()`. Una sola regla con
  nombre para el concepto «sin fecha confiable» del contexto. *Descartado:* filtrar en SQL (`CASE WHEN … THEN NULL`),
  porque esconde la regla en una cadena y la vista de caso necesita la precisión en su propio repositorio.
  *Coordinación con `l1d-74`:* si ese change extrae una regla equivalente reutilizable en `modules/compartido/`, el
  implementador la reutiliza en lugar de duplicarla (regla de dueño único de `config.yaml`).
- **D2 · `FilaDeEvento` y `FilaDeAtributo` ganan `datePrecision`**; el SQL añade `date_precision` a sus `SELECT`. El orden
  `ORDER BY event_date NULLS LAST` no cambia (el contrato no exige orden en `events`).
- **D3 · `currentLine` sin cambios:** `lineaActual()` ya implementa la regla de la historia (Decidido (usuario, 2026-11-03), `[S5 resp. 13]`) (mayor `lineNumber` en
  curso; `null` si ninguno). Solo se cubre con el test de aceptación sobre P-CASO.
- **D4 · Sin cambio en el enmascaramiento:** `enmascararTextoLibre()` recorre todas las cadenas (descripción, `setting`,
  `regimenName`, `value`). El AC-2 se cumple por construcción; el change aporta el test que lo fija. Los nombres se
  detectan porque P-CASO tiene identidad en el lector falso (ADR-40: sin identidad exacta, los patrones no ven nombres).
- **D5 · `biomarkerTrends = []`** se mantiene (requisito «Contexto clínico por allowlist explícita»). Cuando US-091 exista,
  su change lo puebla y modifica ese requisito.

## Privacidad y ownership

- Frontera: `clinical-api` → `rag-orchestrator` (`POST /rag/query`, JWT de servicio). La sesión del doctor no cruza.
  `web` no cambia.
- Cruzan, ya desidentificados: tipo y descripción enmascarada de eventos, esquema enmascarado de tratamientos, valor
  enmascarado de atributos, meses relativos y `provenance`. Nunca `patientId`, identidad, `event_date` ni `started_at`;
  el `pseudoPatientId` es nuevo por consulta (RN-11). `clinicalNotes` sigue vacío.
- Falla cerrada: si el detector o la verificación fallan, `DesidentificacionNoDisponible` y no sale nada.
- La PII sintética de la toxicidad (nombre y documento sintéticos del AC-2 de US-093) se arma en tiempo de test en el soporte de FX-02b-a; no se
  escribe literal en código de producción ni en fixtures versionados que escanee `pii-scan` (el literal ya vive en el
  backlog). Los logs del gateway no registran contexto ni pregunta (requisito vigente).
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; este change no lo modifica.

## Contratos

Sin diff. Proveedor: `rag-orchestrator` (`apps/rag-orchestrator/openapi.yaml`, `ClinicalContext`); consumidor:
`clinical-api` con el cliente generado de `packages/api-contracts`. `events[].monthsAgo`,
`priorTreatments[].monthsSinceStart|monthsSinceEnd` y `attributes[].monthsAgo` ya admiten `null`. Sin ejemplos nuevos.

**Riesgo resuelto (`[S5 resp. 10]` (4), Decidido (usuario, 2026-11-03)):** `priorTreatments[].atcCodes` exige
`^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$`; el código de test `ATC-T-LEUP` no lo cumplía. FX-02b-a y el catálogo de test usan
**ATC reales**: `L02AE02` (leuprorelina) y `L02BB03` (bicalutamida), del subconjunto ATC mínimo que añade l1d-80
(`[S5 resp. 9]`). El patrón **no** se relaja (sin cambio de contrato). Así el contexto de P-CASO valida contra
`ClinicalContext` y contra el Pydantic de `rag-orchestrator`.

## Dependencias y colaboradores

- Modifica: `clinical-context.builder.ts` (D1; `eventoPermitido`, `atributoPermitido`), `evidence-analysis.repository.ts`
  (D2; `FilaDeEvento`, `FilaDeAtributo`, `eventoDe`, `leerEventos`, `leerAtributos`).
- Reutiliza: `mesesTranscurridos()`, `provenanceDe()`, `lineaActual()`, `sqlDatoVigente()`, `enmascararTextoLibre()`,
  `verificarDesidentificado()`. Ninguna regla nueva duplica una existente.
- Tests: soporte `tests/support/caso.ts` (FX-02b-a, de `l1d-74`), `tests/support/gateway.ts` y
  `tests/support/desidentificacion.ts` (lector de identidad falso, captura del request con MSW desde
  `contracts/examples/`).
- Fakes tocados: ninguno nuevo. El lector de identidad falso y el `rag-orchestrator` simulado ya tienen su test de
  contrato en US-049/US-052.

## Evaluación

No aplica: no cambian modelo, prompt, umbral, catálogo ni corpus. El texto del prompt y el resumen embebido no leen
`events`, `priorTreatments` ni `attributes`. La aplicabilidad ya lee `priorTreatments`/`attributes`; este change no
cambia sus valores salvo `monthsAgo = null` de atributos `incierta`, que la aplicabilidad ya admite (`int | None`).

## Decisiones cerradas (antes «Pendientes»)

- **P-1 · Decidido (usuario, 2026-11-03), `[S5 resp. 10]` (4):** FX-02b-a y el catálogo de test usan ATC reales
  (`L02AE02` leuprorelina, `L02BB03` bicalutamida) en lugar de `ATC-T-LEUP`; no se afloja el patrón de `atcCodes`.
  Afecta también a `l1d-74`, `l1d-80` y `l1d-84`, que se alinean en sus propios changes.
- **P-2 · Decidido (usuario, 2026-11-03), `[S5 resp. 13]`:** eventos y tratamientos **siguen fuera** del texto del
  prompt y del resumen embebido en el S5 (Non-Goal del S3). Los AC de US-093 miden el payload; `run-ai-eval` no aplica.
