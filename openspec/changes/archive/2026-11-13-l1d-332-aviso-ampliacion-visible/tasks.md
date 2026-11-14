# Tasks — l1d-332-aviso-ampliacion-visible

> Rama `feat/l1d-332-aviso-ampliacion-visible`, PR `[L1D-332] Avisos de ampliación y de sin opciones visibles en el
> chat`. Sin cambios de API: no hay `## contratos`. Matriz TDD: componentes de `web` → test del AC primero (Testing
> Library + MSW desde `contracts/examples/`); recorrido → Playwright contra Compose con `LLM_PROVIDER=fake`.

## 1. frontend

- [x] 1.1 (test del AC primero) Tests en rojo: aviso de ampliación tras el encabezado y antes de la primera opción [US-274 AC-1]; bloque «Evidencia recuperada sin opciones soportadas» y alcance visibles bajo «Alcance de la respuesta» [US-274 AC-2]; guardas AC-3 y AC-4 · integración (Vitest + Testing Library + MSW); commit `test(L1D-332)` · _Evidencia:_ `docs/evidence/S6-visual-check-332/vitest-rojo.txt` (AC-1 y AC-2 fallan en la aserción)
- [x] 1.2 Implementar prop `avisos` de `AnalysisResult`, avisos subidos en la rama `evidenceAnalysis` y bloques `limitacion`; AC-1…AC-4 en verde; commit `feat(L1D-332)` · _Evidencia:_ `vitest-verde.txt`; Vitest de `apps/web` 131 archivos, 879 tests
- [x] 1.3 E2E del chat falso a 375 y 1280 px [US-274 AC-5]; commit `test(L1D-332)` · _Evidencia:_ `e2e/chat-aviso-ampliacion.spec.ts`: 4 passed contra Compose con `LLM_PROVIDER=fake` (preguntas literales «¿Qué evidencia hay para este caso?» y «Q-TOX»)
- [x] 1.4 Loop visual (visual-check) a 375 y 1280 px; evidencia en `docs/evidence/S6-visual-check-332/` · _Evidencia:_ README de esa carpeta (PASS; rendimiento por DevTools pendiente: el MCP no conectó)
- [x] 1.5 Refactor: Extract Method / Inline Method en los archivos tocados, tests en verde antes y después, commit `refactor(L1D-332)` · _Evidencia:_ refactor: sin cambios (archivos tocados bajo el límite, sin lógica duplicada ni middle man)

## 2. cierre

- [x] 2.1 `openspec validate l1d-332-aviso-ampliacion-visible --strict`, Vitest de `apps/web`, `tsc`, `eslint`, build y E2E en verde · _Evidencia:_ validate, vitest (879), `tsc`, `eslint`, `format:js --check`, build Turbopack, `lint:lenguaje`, `contracts:check`, `pii-scan`, depcruise y el E2E propio en verde
