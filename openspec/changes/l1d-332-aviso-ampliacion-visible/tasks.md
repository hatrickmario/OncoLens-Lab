# Tasks — l1d-332-aviso-ampliacion-visible

> Rama `feat/l1d-332-aviso-ampliacion-visible`, PR `[L1D-332] Avisos de ampliación y de sin opciones visibles en el
> chat`. Sin cambios de API: no hay `## contratos`. Matriz TDD: componentes de `web` → test del AC primero (Testing
> Library + MSW desde `contracts/examples/`); recorrido → Playwright contra Compose con `LLM_PROVIDER=fake`.

## 1. frontend

- [ ] 1.1 (test del AC primero) Tests en rojo: aviso de ampliación tras el encabezado y antes de la primera opción [US-274 AC-1]; bloque «Evidencia recuperada sin opciones soportadas» y alcance visibles bajo «Alcance de la respuesta» [US-274 AC-2]; guardas AC-3 y AC-4 · integración (Vitest + Testing Library + MSW); commit `test(L1D-332)`
- [ ] 1.2 Implementar prop `avisos` de `AnalysisResult`, avisos subidos en la rama `evidenceAnalysis` y bloques `limitacion`; AC-1…AC-4 en verde; commit `feat(L1D-332)`
- [ ] 1.3 E2E del chat falso a 375 y 1280 px [US-274 AC-5]; commit `test(L1D-332)`
- [ ] 1.4 Loop visual (visual-check) a 375 y 1280 px; evidencia en `docs/evidence/S6-visual-check-332/`
- [ ] 1.5 Refactor: Extract Method / Inline Method en los archivos tocados, tests en verde antes y después, commit `refactor(L1D-332)`

## 2. cierre

- [ ] 2.1 `openspec validate l1d-332-aviso-ampliacion-visible --strict`, Vitest de `apps/web`, `tsc`, `eslint`, build y E2E en verde
