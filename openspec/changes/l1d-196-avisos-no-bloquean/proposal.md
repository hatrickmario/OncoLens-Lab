# Proposal — l1d-196-avisos-no-bloquean

## Trazabilidad

L1D-196 · US-071 · FEAT-T3 (L1D-39) · Sprint 5 (oleada O3) · Estimación **3** · RN-26 (dueña) · AC-T3.3 (parte de
avisos; verificación completa con el `403` por opt-out en G-Piloto, S6) · AC-04.2 · AC-08.6 · FR-11 · PP-6 ·
US-071 AC-1…AC-5 · Fuente: `backlog/features/FEAT-T3-control-humano.md` §US-071; sprint:
`backlog/sprints/S5-refinamiento.md` §2 (O3, primera en el orden de recorte) y D-9 (`[S5 resp. 3]`, `[S5 resp. 5]`).

Decisiones que se respetan (no se reabren):

- **D1 aceptado (usuario, 2026-11-03, `[S5 resp. 12]`):** `evidenceOptions[].warnings` solo trae
  `poblacion_no_comparable`; faltantes y datos sin verificar se declaran en la Base del análisis
  (`missingCriticalData`, `patientDataUsed[].reviewStatus`), no en `warnings[]`.
- **D-9 (usuario, 2026-11-03):** con US-101 y US-136 fuera del S5, la historia verifica solo los avisos que existen al
  cierre del S5: `datos_faltantes`, `poblacion_no_comparable` y `datos_sin_verificar` **donde el código actual lo
  produce**. `datos_en_conflicto` y los avisos de la tarjeta de US-101/US-136 quedan como
  «Regresión [RN-26] activa desde S6/Post-MVP», no como escenarios. «Desactualizado» (FEAT-11a) igual.
- **Solo bloquean** la sesión (`401`), el paciente egresado en registros (`422 PACIENTE_EGRESADO`, RN-17) y, desde el S6,
  el opt-out de `analisis_ia` (`403`, RN-15 → US-148). Esta historia no añade ninguno de esos controles.
- **AC-5** recorre la vista de caso mínima (`l1d-76-vista-caso-pagina`, D-1).
- **Política TDD:** RN-26 es una regla de dominio, pero el comportamiento ya existe (historia de verificación sobre
  funciones construidas): el test de aceptación se ejecuta primero y, si pasa, queda como **caracterización** con su
  salida y una mutación comprobada (patrón `l1d-181` D4 y `l1d-195`); si falla en la aserción, la corrección mínima va
  en `feat(L1D-196)`.

## Por qué

El oncólogo pidió que la herramienta le informe sin impedirle continuar (PP-6, P12). Cada aviso clínico se construyó en
una historia distinta (US-005, US-006, US-124, US-128, US-134) y cada una probó su caso aislado; ningún test prueba que
un paciente que los acumula todos llega igual al resultado, ni que las lecturas (ficha, vista de caso, checklist)
responden con sus avisos. RN-26 no tiene dueña verificada hasta esta historia.

## Qué cambia

- **Fixture FX-T3-a** (sintético, `data_origin = sintetico`): paciente de mama con HER2 `3+` `verificado`, Ki-67 `20 %`
  `requiere_revision`, dos RE en conflicto (`conflicts_with_id`), sin `estado_menopausico`, y una fuente de corpus de test
  con HER2 excluyente en `no_coincide` y `populationNotComparable = true`.
  - En integración de `clinical-api`: filas sembradas con el soporte de `tests/support/filas-sinteticas.ts`.
  - En el seed de Compose (E2E): un paciente semilla nuevo (f) y dos campos opcionales del tipo de semilla de biomarcador
    (estado de revisión y conflicto con otra clave), sin cambiar a los pacientes existentes.
- **Ejemplos del contrato** (sin cambio de `openapi.yaml`): `rag-query-request-fx-t3-a.json` y
  `rag-query-fx-t3-a.json` (lo que sirve `LLM_PROVIDER=fake` y el MSW de integración) con su entrada en
  `contracts/examples/index.json`.
- **Tests de `clinical-api`** (Supertest + PostgreSQL real + MSW): análisis de FX-T3-a con `continueWithWarning = true`
  → `200` con los avisos existentes (AC-1); ficha, vista de caso y checklist → `200` con sus avisos (AC-4).
- **E2E Playwright** contra Compose en perfil de test: aviso previo y análisis (AC-2), etiqueta «Población no
  comparable» visible (AC-3), recorrido login → ficha → vista de caso → faltantes → análisis sin diálogos obligatorios
  (AC-5): ningún `dialog` obligatorio; solo los diálogos de registro que el oncólogo abre (`[S5 resp. 12]`).
- **Código de producto:** ninguno previsto. Si un test de aceptación falla en la aserción, la corrección mínima va en el
  módulo que bloquea, en `feat(L1D-196)`.

## Capacidades

- `human-control` (ADDED): los avisos clínicos existentes no bloquean ni el análisis, ni las lecturas, ni el recorrido
  de la UI (dueña de RN-26).

Ninguna capacidad nueva ni MODIFIED: los requisitos de cada aviso siguen en su capacidad (`applicability`,
`analysis-basis`, `completeness`, `evidence-panel`, `evidence-analysis-gateway`); este change los compone sobre un solo
paciente sin duplicarlos.

## Bounded contexts

- `clinical-platform`: tests de integración de `apps/clinical-api`, fixture FX-T3-a y seed de Compose.
- `frontend`: E2E de `apps/web/e2e` (sin cambios de UI previstos).
- `contratos`: solo ejemplos nuevos. Sin `ai-services` (la regla que produce `patientDataWarning` ya tiene sus tests
  en `apps/rag-orchestrator`, US-124).

## Dependencias

- ⛔ `l1d-76-vista-caso-pagina` (US-090): página `/pacientes/{id}/caso` y enlace «Ver caso clínico» para AC-5.
- ⛔ `l1d-74-vista-caso-timeline` (US-088): `GET /platform/patients/{id}/case` para AC-4.
- ↪ `l1d-96-datos-criticos-vista-caso` (US-004): columna «Datos críticos» en la vista de caso; si se recorta, el paso
  «faltantes» del AC-5 es el aviso del panel (US-005, mergeado).
- ↪ `l1d-310` (US-254, pacientes sintéticos; change aún no creado): ambos tocan el seed y el conteo del listado E2E; se
  secuencian en la oleada O3 (design D4).
- ↪ US-005, US-006, US-124, US-128, US-134 (mergeados): cada aviso ya existe.

## Fuera de alcance

- `datos_en_conflicto` y `datos_sin_verificar` en `evidenceOptions[].warnings` y en la tarjeta: US-101 / US-136
  (Regresión [RN-26] activa desde S6/Post-MVP).
- «Desactualizado» (FEAT-11a, S6 si hay capacidad).
- `403` por opt-out de `analisis_ia`: US-148 (Regresión [RN-15] activa desde S6).
- Diálogos «Cargar información» / «Continuar con aviso»: no existen ni se crean (el aviso del panel es un bloque
  `role="status"` con el botón siempre habilitado, US-005). Los únicos diálogos del recorrido son los de registro que el
  oncólogo abre («Registrar biomarcador», «Completar diagnóstico a mano», «Agregar tratamiento previo», «Registrar
  atributo»), de `l1d-91`/`l1d-80`/`l1d-96`.
- `patientDataWarning = en_conflicto` por criterio: Regresión [RN-26] activa desde S6/Post-MVP (`[S5 resp. 12]`).
