# Tasks — l1d-187-panel-base-analisis

> Matriz TDD (CLAUDE.md): componente de `web` → **test del AC primero** (Testing Library + MSW), commit
> `test(L1D-187)` en rojo antes de `feat(L1D-187)`; funciones puras de `lib/evidence/` con unitarios dentro del
> `feat`. Mocks solo en los bordes: MSW sobre `/api/*` desde `contracts/examples/`. Nunca `.skip`, `.only` ni
> `it.todo`. Sin `contract`: el spec no cambia.

## 1. contratos

- [x] 1.1 (exento: sin diff) `contracts:check` sin diferencias; tipos de `AnalysisBasis` usados desde `packages/api-contracts` sin editar.

## 2. frontend

- [x] 2.1 (test del AC primero) Test en rojo: "muestra el resumen con faltantes, supuestos con el texto del supuesto declarado, fuentes no incluidas, omitidas y la fecha 30/09/2026 sin expandir [US-067 AC-1]" · componente (Vitest + Testing Library + MSW con `con-evidencia-s1.json` adaptado a [US-066 AC-1]). Esqueleto de `AnalysisBasisPanel` que no renderiza nada. Commit `test(L1D-187)`.
- [x] 2.2 (test del AC primero) Test en rojo: "muestra datos usados con su revisión en texto y fuentes con fragmentos recuperados y sobre el umbral al expandir [US-067 AC-2]" · componente. Commit `test(L1D-187)`.
- [x] 2.2b (test del AC primero) Tests en rojo: "en el detalle las fuentes no incluidas dicen sin licencia abierta; su contenido no se consultó [US-067 AC-2]", "rotula Limitación estructural la limitación de origin estructural [US-067 AC-2]" y "dice No se consultó el corpus: tipo fuera de alcance ante tipo_no_habilitado [US-067 AC-3]" (MSW con `tipo-no-habilitado.json`). Commit `test(L1D-187)`.
- [x] 2.3 (test del AC primero) Test en rojo: "dice qué fuentes y filtros se buscaron y 0 fragmentos sobre el umbral sin expandir cuando no hay evidencia [US-067 AC-3]" · componente con `sin-evidencia.json`. Commit `test(L1D-187)`.
- [x] 2.4 (test del AC primero) Test en rojo: "muestra Afirmaciones omitidas: 1 y nunca el texto de la afirmación cuando omittedClaims es 1 [US-067 AC-4]" · componente, colapsado y expandido. Commit `test(L1D-187)`.
- [x] 2.5 (test del AC primero) Test en rojo: "el botón de la Base cambia aria-expanded de false a true al activarlo con teclado [US-067 AC-5]" · componente con `user-event` (Tab + Enter/Espacio). Commit `test(L1D-187)`.
- [x] 2.6 Implementar `resumirBase()`, `describirBusqueda()`, `formatearFechaDeCorte()` y `textoDeRevision()` en `lib/evidence/` (unitarios uno a la vez: listas vacías; varias fuentes; filtros "ninguno"; fecha sin desfase de zona; cada `reviewStatus` y `conflict`), textos en `lib/mensajes.ts`, el organismo `AnalysisBasisPanel` y su montaje en `AnalysisResult` (S2-09). Verificación: 2.1–2.5 en verde. Commit `feat(L1D-187)`.
- [ ] 2.7 (test del AC primero) E2E Playwright contra Compose (perfil de test, `LLM_PROVIDER=fake`, seed sintético): resumen visible con evidencia y "Qué se buscó" sin evidencia [US-067 AC-1] [US-067 AC-3]. Requiere `l1d-186-base-analisis-builder` en `main`; tiempo máximo explícito. Commit `test(L1D-187)` / `feat(L1D-187)` según el orden en que mergee L1D-186.
- [ ] 2.8 (PENDIENTE: `docker compose up` falla con "Pool overlaps" por los stacks de otros worktrees; el spec de 2.7 está escrito y sin ejecutar) Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px; cada fallo se convierte primero en un test en rojo.
- [x] 2.9 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-187)`.

## 3. Verificación

- [x] 3.1 `openspec validate l1d-187-panel-base-analisis --strict` en verde.
- [ ] 3.2 Suite de `apps/web` en verde (Vitest) y E2E de 2.7 en verde.
- [ ] 3.3 `clinical-language-auditor` sobre los textos nuevos (RN-19, RN-23, RN-26) en el Gate 2.
