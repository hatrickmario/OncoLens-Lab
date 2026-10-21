# Tasks — l1d-186-base-analisis-builder

> Matriz TDD (CLAUDE.md): builder con reglas de dominio y endpoint → **TDD estricto, doble bucle** (commit
> `test(L1D-186)` en rojo antes de `feat(L1D-186)`); composición y configuración → **test después**.
> Mocks solo en los bordes: `rag-orchestrator` con MSW desde `contracts/examples/`; PostgreSQL real de test; reloj e
> IDs inyectados. Nunca `.skip`, `.only` ni `it.todo`. Sin `contract`: el spec no cambia.

## 1. contratos

- [x] 1.1 (exento: sin diff) `contracts:check` y `contracts:breaking` contra `main` sin diferencias en `apps/clinical-api/openapi.yaml`; tipos generados usados sin editar.

## 2. clinical-platform

- [x] 2.1 (test después) Fixture FX-T1a-a en `tests/support/filas-sinteticas.ts` (Ki-67 `requiere_revision`, RP `rechazado` y `reemplazado`, RE `90 %` con `conflicts_with_id`) y handlers MSW de `/rag/query` con `LLM-OK`, `sin_evidencia` de `Q-SIN` y `omittedClaims = 1`, construidos desde `contracts/examples/`. Verificación: test de humo del fixture.
- [x] 2.2 (TDD estricto) Test de aceptación en rojo: "devuelve la Base con datos usados, fuentes consultadas, fuentes no incluidas, fecha de corte y el supuesto declarado de faltantes no calculados cuando Q-HER2 tiene evidencia [US-066 AC-1]" · integración (Supertest + BD real + MSW), validando contra el spec. Commit `test(L1D-186)`.
- [x] 2.3 (TDD estricto) Test de aceptación en rojo: "devuelve la Base con aboveThreshold 0 y los datos usados cuando no hay evidencia [US-066 AC-2]" · integración. Commit `test(L1D-186)`.
- [x] 2.4 (TDD estricto) Test de aceptación en rojo: "cuenta una afirmación omitida sin su texto cuando rag-orchestrator devuelve omittedClaims 1 [US-066 AC-3]" · integración. Commit `test(L1D-186)`.
- [x] 2.5 (TDD estricto) Test de aceptación en rojo: "persiste en el registro la misma Base que responde [US-066 AC-5]" · integración. Commit `test(L1D-186)`.
- [x] 2.6 (TDD estricto) Test de aceptación en rojo: "lista el Ki-67 por revisar y el receptor de estrógeno en conflicto y omite los rechazados cuando el contexto viene de FX-T1a-a [US-066 AC-6]" · unitario del builder sobre el contexto armado por `construirContextoPermitido()` real. Esqueleto de `crearBaseDelAnalisis()` con `throw new Error('no implementado')`. Commit `test(L1D-186)`.
- [x] 2.7 (TDD estricto) Test de aceptación en rojo: "produce la misma Base byte a byte cuando se ejecuta dos veces con las mismas entradas [US-066 AC-4]" · unitario. Commit `test(L1D-186)`.
- [x] 2.8 Extraer `verbalizarDatoDelContexto()` (ADR-34, FR-27 a) en `analysis-basis.verbalizacion.ts`, con unitarios uno a la vez (biomarcador con unidad y método; sin unidad; diagnóstico con y sin estadio; atributo; tratamiento; evento; campo ausente omitido; sin fechas absolutas ni identidad). Commit `feat(L1D-186)`.
- [x] 2.9 Implementar `crearBaseDelAnalisis()` (`datosDelPacienteUsados()`, `fuentesSeleccionadas()`, `supuestosVerificados()`), sustituir el supuesto fijo del S1 por `SUPUESTO_FALTANTES_NO_CALCULADOS` (`regla_catalogo`, decisión 4) y dejar de leer `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT` en `src/config.ts`; componer el builder en `evidence-analysis.module.ts`. Verificación: 2.2–2.7 en verde. Commit `feat(L1D-186)`. Retiro de la clave en `.env.example`/Compose: en el mismo PR con aprobación del humano, o deuda con ID.
- [x] 2.10 (test después) Test de no-fuga [RN-10]: con el paciente semilla (a), ninguna `label` contiene nombre, documento, fecha `AAAA-MM-DD` ni el `pseudoPatientId`. Verificación: test en verde.
- [x] 2.11 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-186)`.

## 3. Verificación

- [x] 3.1 `openspec validate l1d-186-base-analisis-builder --strict` en verde.
- [x] 3.2 Suite de `apps/clinical-api` en verde (Vitest + Supertest).
- [x] 3.3 `contracts:verify-provider` (o el helper vigente de US-214) sobre las respuestas de `POST /platform/evidence-analyses` en los tests de integración.
