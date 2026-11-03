# Proposal — l1d-74-vista-caso-timeline

## Trazabilidad

L1D-74 · US-088 · FEAT-02b (L1D-10) · Sprint 5 · Estimación **5** · HU-15 · FR-21 (timeline, dueña) · FR-23
(checklist en la vista) · RN-07 · RN-26 · ADR-32 · readme §3.3 #32 · AC-02.1, AC-02.2, AC-02.6, AC-11.4, AC-04.1
(vista) · M-02.2, M-02.4 (medidos en US-105) · US-088 AC-1…AC-8 ·
`backlog/features/FEAT-02b-vista-de-caso.md` · `backlog/sprints/S5-refinamiento.md` D-1, D-8 (`[S5 resp. 1]`,
`[S5 resp. 5]`) · ADR-50 (lecturas sin `rechazado`/`reemplazado`) · Gate 1 del S5: `[S5 resp. 10]` (ATC reales),
`[S5 resp. 11]` (origen de los eventos de IA), `[S5 resp. 12]` (`description` con `no-store`), `[S5 resp. 13]`
(supuestos decididos) y cadena de versiones (clinical-api 1.17.0)

## Por qué

La reconstrucción manual del caso es el dolor transversal más fuerte del Discovery (AS-IS P1; JTBD 1 y 7). G-Demo
(PRD E-17) exige ver el caso reconstruido en una pantalla antes de los faltantes y del análisis. D-1 eligió la
**vista de caso mínima** (US-088 + US-090) y D-8 fija que US-088 llene **todos** los campos obligatorios del
`CaseView` congelado: el timeline con sus eventos derivados y, además, `priorTreatments`, `attributes` y
`biomarkerSeries` con lecturas simples, sin las reglas de US-089.

## Qué cambia

- `clinical-api`: módulo nuevo `src/modules/case-view/` (Controller → Service → Repository) con
  `GET /platform/patients/{patientId}/case` → `CaseView` (permiso `clinical:read`; `admin` → `403`; sin sesión →
  `401`; paciente inexistente o UUID mal formado → `404 { error, message }`).
  - `CaseTimelineService` (determinista, sin IA): deriva eventos de `Diagnosis` (`diagnosed_at`), `Exam`
    (`performed_at`), `PriorTreatment` (inicio y fin) y `AIAnalysisRecord` (`created_at`, `analisis_evidencia` y
    `resumen_caso`) con `derived = true`, y los une con las filas de `ClinicalEvent` (`derived = false`). Orden
    cronológico ascendente; los de `datePrecision = incierta` van con `eventDate = null` al final.
  - Lecturas simples (D-8): `priorTreatments` ordenados por línea (sin número al final) y fecha de inicio;
    `attributes` por clave y fecha; `biomarkerSeries` agrupadas por nombre con sus puntos en orden cronológico.
    `additionalSourceDocumentIds = []` en toda la vista (las fuentes adicionales son de US-089/US-099).
  - Toda lectura excluye `rechazado` y `reemplazado` con el predicado único `sqlDatoVigente()` (RN-07, ADR-50).
  - `completeness` y `catalogVersion` salen del **mismo** `CompletenessService` que `/completeness` (AC-8).
  - Una consulta por entidad, sin N+1 (M-02.4).
  - Eventos de IA (`analisis_ia`, `resumen_caso`): procedencia técnica `manual` / `n_a` / `auto_aceptado` (el enum
    del contrato no tiene valor de IA); ningún consumidor la muestra como «Registro manual»: el origen visible es
    «Generado por IA · Sin verificar» por `eventType` (`[S5 resp. 11]`, lo pinta `l1d-76`).
  - Respuesta con `Cache-Control: no-store`; `description` sin enmascarar hacia el oncólogo y nunca en logs
    (`[S5 resp. 12]`, revisión en G-Piloto).
- `clinical-api` (ficha): `pendingReviewCount` cuenta también los `ClinicalEvent` vigentes con
  `date_precision = incierta`, aunque estén `verificado` (US-088 AC-3, PRD AC-02.2).
- Contrato: cambio **aditivo** en `apps/clinical-api/openapi.yaml` (`info.version` 1.16.0 → **1.17.0**, cadena del
  S5): `getPatientCase` declara `500 ErrorInterno` (hoy solo 200/401/403/404) y la cabecera `Cache-Control: no-store`
  del `200`. La forma de `CaseView` no cambia. Ejemplo nuevo **`contracts/examples/case-view-p-caso.json`**
  (FX-02b-a, lo crea este change como proveedor) con su entrada en `contracts/examples/index.json`, y un test que
  compara la respuesta real de FX-02b-a con él; `l1d-76` y `l1d-96` lo consumen.
- Tests: fixture **FX-02b-a (P-CASO)** sembrado por el soporte de tests (sin OCR: las filas con
  `entry_method = ocr` se insertan como datos), reloj fijo en 2026-10-01, UUID fijos y códigos ATC reales
  (`L02AE02` leuprorelina, `L02BB03` bicalutamida; `[S5 resp. 10]`, sustituyen a `ATC-T-LEUP` de `FEAT-02b`).

## Capacidades

- `case-timeline` (**nueva**; prevista en la lista de capacidades de `openspec/config.yaml`): la vista de caso y su
  timeline no tienen requisito en ninguna capacidad existente.
- `patients-identity` (MODIFIED): el requisito «Contador de datos pendientes de revisión» suma los eventos sin
  fecha confiable.

## Bounded contexts

clinical-platform (módulo `case-view`, ajuste del contador de la ficha, contrato del proveedor). Sin frontend (la
página es US-090, `l1d-76`) ni ai-services.

## Dependencias

- ⛔ **ARR-10** (O1): archiva `l1d-72-ficha-minima-paciente`; sin ese archivo el MODIFIED de
  «Contador de datos pendientes de revisión» no encuentra el requisito en `openspec/specs/patients-identity`.
  No bloquea la implementación, solo el archivo de este change.
- ↪ Archivados/mergeados: `l1d-72` (ficha, `pendingReviewCount`, `FUENTES_POR_REVISAR`), US-003 (completitud,
  `CompletenessService`, FX-04-b F-M2 y `test-1.0.0`), US-053 (análisis como evento derivado, sin `ClinicalEvent`),
  `compartido/estados-de-revision.ts` (`sqlDatoVigente`).
- ↪ US-087 (datos extraídos) **no** bloquea: con el OCR en Post-MVP (PRD E-17) los fixtures se siembran.
- ↪ Cadena de versiones del contrato: sale tras `l1d-268` (1.16.0); quien rebase renumera y regenera
  `packages/api-contracts`, nunca fusiona generados a mano.
- 🔗 Consumido por `l1d-76` (US-090, vista de caso, y el ejemplo `case-view-p-caso.json`), `l1d-96` (US-004, datos críticos con acción en la vista) y
  `l1d-79` (US-093, tendencias y eventos en el contexto). 🔗 Lecturas de las correcciones de `l1d-309` (US-253,
  ADR-50) y de los registros manuales de `l1d-90` (US-110) y `l1d-80` (US-094), sin bloquear.
- 🔗 Regresión [FR-18] → US-102 (lectura auditada, S6). 🔗 Medido en US-105 (M-02.2, M-02.4, NFR-03 p95 ≤ 2 s).

## Fuera de alcance

- Reglas de US-089 (S6 `si-hay-capacidad`): fuentes adicionales (`additionalSourceDocumentIds` desde
  `ClinicalDataSource`, US-099), «PSA siempre serie» y exclusión de biomarcadores con un solo valor, agrupación por
  línea en la UI.
- `Treatment` (decisiones registradas en OncoLens): no tiene escritor en el MVP (Post-MVP); la derivación se añade
  con su historia.
- Tendencia (US-091), descarga del PDF de origen (US-212, Post-MVP), visor del documento (US-080), auditoría de la
  lectura (US-102, S6), registro manual de tratamientos y atributos (US-094).
- La página de la vista de caso (US-090) y el enmascaramiento del texto hacia la IA (US-052/US-093).
