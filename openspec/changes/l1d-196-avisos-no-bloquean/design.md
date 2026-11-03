# Design — l1d-196-avisos-no-bloquean

## Contexto

Ver proposal.md (Por qué). Inventario de dónde vive hoy cada aviso de RN-26 (investigado en el repo el 2026-11-03):

| Aviso | Dónde se produce hoy | Dónde se ve |
|---|---|---|
| `poblacion_no_comparable` | `rag-orchestrator` (`domain/applicability_aggregation.py`, `AVISO_POBLACION_NO_COMPARABLE`) → `evidenceOptions[].warnings` y `populationNotComparable`; `clinical-api` lo propaga | `option-applicability.tsx`, `applicability-source.tsx` («Población no comparable») |
| `datos_faltantes` | `clinical-api`: checklist en el servidor (US-006) → `analysisBasis.missingCriticalData(Labels)` + `continuedWithWarning`; `/completeness` (`faltante`); `rag-orchestrator`: `patientDataWarning = faltante` por criterio | aviso previo del panel (US-005), Base del análisis (US-128), fila del criterio |
| `datos_sin_verificar` | `clinical-api`: `Provenance.reviewStatus` en ficha, vista de caso, `patientDataUsed` y `/completeness` (`presente_sin_verificar`); `rag-orchestrator`: `patientDataWarning = sin_verificar` **solo si el dato es de un criterio del catálogo de aplicabilidad** | ficha, Base, fila del criterio |
| `datos_en_conflicto` | `Provenance.conflict` y `patientDataWarning = en_conflicto` por criterio | fila del criterio (`valores_en_conflicto`) |

Hallazgo: **ningún código emite `datos_faltantes`, `datos_sin_verificar` ni `datos_en_conflicto` en `evidenceOptions[].warnings`**; el enum del contrato los admite, pero el único valor que se emite es `poblacion_no_comparable`. Ki-67 (el dato `requiere_revision` de FX-T3-a) es dato crítico pero no criterio de aplicabilidad de mama, así que no produce `patientDataWarning`.

## Decisiones

- **D1 · Cada aviso se verifica donde existe hoy, sin crear emisiones nuevas.** *Decidido (usuario, 2026-11-03, `[S5 resp. 12]`).* AC-1 se afirma sobre `warnings`/`populationNotComparable` (población), `analysisBasis.missingCriticalData` + `continuedWithWarning` (faltantes) y `patientDataUsed[].reviewStatus` (sin verificar). Poblar `warnings[]` con los otros tres valores es la tarjeta de US-136/US-101 (D-9). *Descartada:* emitirlos aquí (cambio de comportamiento del contrato en una historia de 3 pts de verificación, fuera de D-9).
- **D2 · `datos_en_conflicto` entra al fixture, no a las aserciones.** FX-T3-a conserva los dos RE en conflicto para probar que el conflicto no bloquea (`200`), pero ningún escenario afirma su aviso (D-9: Regresión [RN-26] activa desde S6/Post-MVP). El ejemplo `rag-query-fx-t3-a.json` es fiel a la regla real (`aviso_dato_paciente`: el conflicto del dato del paciente no altera el estado) y trae `receptores_hormonales` en `coincide` con `patientDataWarning = en_conflicto`; el E2E no lo afirma.
- **D3 · «Continuar con aviso» = «Analizar evidencia» con el bloque de faltantes visible.** El panel actual (US-005) no tiene diálogo: el bloque es `role="status"` y el botón está siempre habilitado y envía `continueWithWarning = true`. AC-2 se verifica así; AC-5 exige que no aparezca ningún `dialog`/`alertdialog` obligatorio: los únicos diálogos del recorrido son los de registro que abre el oncólogo («Registrar biomarcador», «Completar diagnóstico a mano», «Agregar tratamiento previo», «Registrar atributo»), y el E2E no los abre. Botones reales: «Analizar la evidencia para este caso» (vista de caso) y «Analizar evidencia» (panel) (`[S5 resp. 12]`).
- **D4 · FX-T3-a en Compose es el paciente semilla (f).** El tipo `BiomarcadorSemilla` gana dos campos opcionales (`estadoDeRevision`, por defecto `verificado` como hoy, y `enConflictoCon`, clave de otro biomarcador del mismo paciente que el seed resuelve a `conflicts_with_id`). Los pacientes (a)…(e) no cambian. El conteo del listado E2E (`pacientes-listado.spec.ts`, hoy 5) se actualiza al número de pacientes del seed leído del módulo del seed, no con un literal nuevo; si `l1d-310` (US-254) ya cambió el seed, se reutiliza su mecanismo y este change solo añade (f). *Descartada:* crear el estado por API en el E2E (los registros manuales nacen `verificado`; no se puede producir `requiere_revision` ni conflicto).
- **D5 · Pregunta propia del fixture.** El modo fingido elige la respuesta por `query` exacta; `rag-query-request-fx-t3-a.json` usa una pregunta distinta de las existentes (sin términos prohibidos, RN-23). El MSW de integración de `clinical-api` sirve el mismo ejemplo (US-213).
- **D6 · Caracterización.** Si un test de aceptación pasa al primer intento, el commit `test(L1D-196)` lleva su salida y una mutación comprobada (por ejemplo, forzar `4xx` cuando `missingCriticalData` no está vacío y ver el rojo), como en `l1d-195`.

## Privacidad y ownership

- Todo dato es sintético (`data_origin = sintetico`, RN-13/RN-14); FX-T3-a no lleva PII; la identidad sintética del paciente (f) sigue el mecanismo cifrado del seed (no versionada en claro).
- Frontera: `web` → `clinical-api` (cookie) → `rag-orchestrator` (JWT de servicio) sin cambios; en integración, `rag-orchestrator` está simulado por MSW; en E2E, en modo fingido. `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; el ejemplo nuevo solo contiene contexto desidentificado y chunks del corpus de test.
- **Seguridad web:** sin cambios en `apps/web` de producto (solo E2E): sin `NEXT_PUBLIC_` nuevas, sin cambios de CSP ni dependencias.

## Contratos

- Sin cambios en `apps/clinical-api/openapi.yaml` ni `apps/rag-orchestrator/openapi.yaml` (ADR-26 intacto; `oasdiff` sin diferencias).
- Ejemplos nuevos (proveedor `rag-orchestrator`, consumidor `clinical-api`): `contracts/examples/rag-query-request-fx-t3-a.json` (`RagQueryInternalRequest`) y `contracts/examples/rag-query-fx-t3-a.json` (`RagQueryInternalResponse`, `con_evidencia`, una opción con `estado_her2` `no_coincide` excluyente, `estado_menopausico` `desconocido` + `falta_en_paciente` + `faltante`, `receptores_hormonales` `coincide` + `en_conflicto` (el conflicto es del dato del paciente; `valores_en_conflicto` es de los fragmentos del estudio y no aplica), `populationNotComparable = true`, `warnings = [poblacion_no_comparable]`, citas al corpus de test). Entradas en `contracts/examples/index.json`; los valida `contracts:check`.

## Componentes y patrones

Sin componentes nuevos ni patrones: solo E2E sobre la UI existente (panel S4, vista de caso S5-05 de `docs/ux/S5/pantallas-s5.md`). Si un E2E revela un bloqueo de UI, la corrección mínima va en el componente afectado y se revisa con `visual-check`.

## Dependencias y colaboradores

- Se crean: `apps/clinical-api/tests/support/fx-t3-a.ts` (filas de FX-T3-a sobre `filas-sinteticas.ts` y `completitud.ts`), `tests/integration/evidence-analysis/avisos-no-bloquean.test.ts`, `tests/integration/pacientes/lecturas-con-avisos.test.ts`, `apps/web/e2e/avisos-no-bloquean.spec.ts`, `apps/clinical-api/prisma/seed/pacientes/f.ts`.
- Se modifican: `prisma/seed/pacientes/tipos.ts` y el sembrador de biomarcadores (campos opcionales de D4), `apps/web/e2e/soporte.ts` (ID de (f)), `pacientes-listado.spec.ts` (conteo desde el seed).
- Sin reglas de dominio nuevas: la regla de RN-26 ya vive en cada dueño (checklist, `aviso_dato_paciente`, agregación de población); no se duplica ningún literal.
- Fakes tocados: ninguno nuevo; `FakeEvidenceQuery` ya tiene su test de contrato (US-034 AC-6) y solo recibe un ejemplo más.

## Riesgos / Trade-offs

- [El conteo del listado cambia con dos changes del seed en la misma oleada] → D4: conteo derivado del seed; `/sprint-run` secuencia `l1d-310` y este change.
- [AC-1 literal nombra cuatro avisos en la respuesta] → D1 (decidido, `[S5 resp. 12]`) + D-9: dos se verifican en su lugar actual (Base del análisis) y dos son regresión.
- [El ejemplo fingido podría divergir de la regla real] → se construye aplicando a mano las reglas de `applicability_rules.py` sobre FX-T3-a y se revisa en el Gate 1; no sustituye a los tests de `rag-orchestrator` de US-124.

## Pendiente de definir

Nada. P1 (D1) y P2 (`en_conflicto` por criterio como regresión) quedan **Decididos (usuario, 2026-11-03, `[S5 resp. 12]`)**.
