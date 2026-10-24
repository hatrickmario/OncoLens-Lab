# Tasks — l1d-94-checklist-determinista

> ↪ Depende de **L1D-93 (US-001)** (forma del ítem de `datos-criticos.json`, `verifiedReviewStatuses`, cargador
> validado), creado en paralelo en el S3: los AC se verifican con FX-04-a, así que el change avanza en paralelo y
> se rebasa sobre L1D-93 antes del Gate 2 (design, Risks).
>
> Matriz TDD (CLAUDE.md): regla de dominio y service con lógica → **TDD estricto, doble bucle** (commit
> `test(L1D-94)` con el test de aceptación en rojo antes de su `feat(L1D-94)`); fixtures y cableado → **test
> después**. Integración con PostgreSQL real de test (US-038) y MSW como único mock, en el HTTP saliente hacia
> `rag-orchestrator`; nunca `vi.mock` de módulos propios ni de Prisma. Reloj e IDs inyectados. Nunca `.skip`,
> `.only` ni `it.todo`. Sin cambio de API: no hay sección `## contratos` ni commit `contract(L1D-94)`.

## 1. clinical-platform

- [ ] 1.1 (test después) Fixtures FX-04-a: catálogos `test-1.0.0` y `test-1.1.0` (sin `ki67`) con la tabla de US-002 y `verifiedReviewStatuses = ["verificado", "corregido"]`, en `packages/clinical-catalogs/test/fixtures/` (reutilizar los de L1D-93 si ya existen). Verificación: `catalog:validate` de L1D-93 los acepta (o, sin él, test de humo de carga en verde).
- [ ] 1.2 (test después) Fixtures FX-04-b: siembra de F-M1, F-M2 (con el Ki-67 `no_mapeado` "Ki67 índice" del AC-8 y la `ClinicalNote` con PII sintética generada en tiempo de test, no versionada), F-M3 y F-P1, todos `data_origin = sintetico`, en `apps/clinical-api/tests/fixtures/completeness/` con un helper de `tests/support/`. Verificación: test de humo de la siembra en verde.
- [ ] 1.3 (TDD estricto) Test de aceptación en rojo: "devuelve 12 ítems con nueve presente_verificado y her2_ish, tratamientos_previos y brca_germinal en no_aplica cuando F-M1 está completo [US-002 AC-1]" · integración. Esqueleto de `createCompletenessService` con `throw new Error('no implementado')`. Commit `test(L1D-94)`.
- [ ] 1.4 (TDD estricto) Test de aceptación en rojo: "clasifica exactamente cada ítem de F-M2 con re en presente_sin_verificar y seis faltantes cuando los estados son mixtos [US-002 AC-2]" · integración, incluida la variante de F-M1 con un RE posterior en `requiere_revision` (regla del más reciente, `[S3 resp. 5]`). Commit `test(L1D-94)`.
- [ ] 1.5 (TDD estricto) Test de aceptación en rojo: "deja rp en faltante cuando su único registro está rechazado [US-002 AC-3]" · integración. Commit `test(L1D-94)`.
- [ ] 1.6 (TDD estricto) Test de aceptación en rojo: "aplica el whenConditionUnknown de cada ítem cuando F-M3 no tiene TNM ni HER2 [US-002 AC-4]" · integración. Commit `test(L1D-94)`.
- [ ] 1.7 (TDD estricto) Test de aceptación en rojo: "da dos serializaciones idénticas y cero llamadas a rag-orchestrator cuando se calcula dos veces F-M2 [US-002 AC-5]" · integración con contador de MSW sobre el HTTP saliente. Commit `test(L1D-94)`.
- [ ] 1.8 (TDD estricto) Test de aceptación en rojo: "devuelve 11 ítems sin ki67, 5 faltantes y catalogVersion test-1.1.0 cuando la misma build arranca con test-1.1.0 [US-002 AC-6]" · integración (arranque de la app con `CLINICAL_CATALOG_PATH` de test). Commit `test(L1D-94)`.
- [ ] 1.9 (TDD estricto) Test de aceptación en rojo: "devuelve solo psa_serie y ecog en presente_verificado cuando el paciente es F-P1 de próstata [US-002 AC-7]" · integración. Commit `test(L1D-94)`.
- [ ] 1.10 (TDD estricto) Test de aceptación en rojo: "deja ki67 en faltante cuando el único Ki-67 de F-M2 está no_mapeado [US-002 AC-8]" · integración. Commit `test(L1D-94)`.
- [ ] 1.11 (TDD estricto) Extraer en `completeness.rules.ts` `itemsDelTipoActivo()`, `evaluarCondicion()`, `registrosVigentes()` (RN-07, reutiliza `ESTADOS_DESCARTADOS`), `registroQueCuenta()` y `estadoDeVerificacion()` (design D2–D4), con unitarios uno a la vez (sin diagnóstico activo; tipo de cáncer filtra; sin condición; condición no cumplida → no_aplica; condición no evaluable → whenConditionUnknown; operador de prefijo; pertenencia; rechazado/reemplazado excluidos; menos de `minValues` → faltante; más reciente sin verificar gana; registro sin fecha más antiguo; empate por `created_at`; orden del catálogo conservado). Verificación: unitarios en verde. Commit `feat(L1D-94)`.
- [ ] 1.12 (TDD estricto) `completeness.repository.ts` (una consulta por entidad de destino, `sqlDatoVigente()`, `Biomarker` vía `Exam`, excluye `no_mapeado`, nunca lee `identity` ni `ClinicalNote`), `ports.ts`, `createCompletenessService` (factory con repositorio y catálogo por parámetro) y `completeness.module.ts` cableado en `src/composition.ts` con el cargador de L1D-93. Verificación: 1.3–1.10 en verde. Commit `feat(L1D-94)`.
- [ ] 1.13 (test después) No-fuga en logs: el cálculo de F-M2 no registra valores clínicos ni la PII sintética de su `ClinicalNote`; solo UUID, `catalogVersion`, conteos y latencia. Verificación: test con `tests/support/captura-de-salidas.ts` en verde.
- [ ] 1.14 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-94)`.

## 2. evaluación

- [ ] 2.1 (exento) Sin cambio de modelo, prompt, umbral, catálogo real ni corpus: `run-ai-eval` no aplica. M-04.1 y M-04.2 se miden en US-131. Verificación: nota en el PR.

## 3. Verificación

- [ ] 3.1 `openspec validate l1d-94-checklist-determinista --strict` en verde.
- [ ] 3.2 Suite de `apps/clinical-api` en verde (Vitest, unitarios e integración); sin cambios de API, no aplican `contracts:verify-provider` ni `contracts:breaking`.
