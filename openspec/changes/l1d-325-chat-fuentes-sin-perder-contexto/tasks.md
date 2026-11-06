# Tasks — l1d-325-chat-fuentes-sin-perder-contexto

> Rama `feat/l1d-325-chat-fuentes-sin-perder-contexto`, PR `[L1D-325] Chat: abrir fuentes, expandir y referencias
> sin perder el contexto`. Rebasa sobre `l1d-324-panel-conversacional` (US-267) y respeta la decisión de UI de
> ADR-51 §8 (`l1d-314-spike-assistant-ui`). Sin cambios de API: no hay `## contratos`. Matriz TDD: componentes de
> `web` → **test del AC primero** (Testing Library + MSW desde `contracts/examples/`); recorridos → Playwright contra
> Compose con `LLM_PROVIDER=fake` y seed sintético. Referencia visual: `docs/ux/S6/variante-b.html`.

## 1. frontend

- [ ] 1.1 (test del AC primero) Test en rojo: la tabla de aplicabilidad y «2 afirmaciones omitidas por falta de soporte» aparecen al expandir el turno con `omittedClaims = 2`, `aria-pressed` alterna y los otros dos turnos no cambian cuando se expande y se pliega [US-268 AC-3] · integración (Vitest + Testing Library + MSW); commit `test(L1D-325)`
- [ ] 1.2 (test del AC primero) Test en rojo: «Ver referencias» lista tres citas con metadatos y «No disponible» en los ausentes, y cada enlace externo tiene `target="_blank"` y `rel="noopener noreferrer"` [US-268 AC-4] · integración; commit `test(L1D-325)`
- [ ] 1.3 (test del AC primero) Test en rojo: una referencia con `sourceUrl = "javascript:alert(1)"` no tiene ningún `href` ni en «Ver referencias» ni en el panel lateral de la cita (regla de L1D-266, verificada en estas superficies) y un `chunkTextSnapshot` con `<img src=x onerror="window.__xss=1">` abierto en el panel lateral no crea `img` ni ejecuta el manejador [US-268 AC-5] [glosario §3] · integración; commit `test(L1D-325)`
- [ ] 1.4 (test del AC primero) Test en rojo: el panel lateral de la cita conserva el *scroll* del hilo y el borrador de la pregunta al cerrarse con `Esc` y devuelve el foco a la cita [US-268 AC-1] · E2E (Playwright contra Compose, tiempo máximo explícito); commit `test(L1D-325)`
- [ ] 1.5 (test del AC primero) Test en rojo: «Ver en el caso» de HER2 `3+` de `P-CHAT` (FX-12-b) abre el dato con su origen y el `2+` reemplazado en el histórico, sin cambiar la URL y con los turnos montados [US-268 AC-2] · E2E (Playwright contra Compose); commit `test(L1D-325)`
- [ ] 1.6 (test del AC primero) Tests de los bordes asumidos: diagnóstico sin petición a `…/history`; `503` de `…/case` muestra «No se pudo cargar el dato» con «Reintentar» y la conversación intacta; `omittedClaims = 0` sin aviso · integración (MSW); commit `test(L1D-325)`
- [ ] 1.7 Implementar `components/ui/sheet.tsx` (variante lateral de `dialog.tsx`, `retornoDeFoco`, ancho completo < 480 px) y el estado `panelLateral` en el padre del panel de US-267; AC-1 en verde; commit `feat(L1D-325)`
- [ ] 1.8 Implementar `panel-lateral-del-chat.tsx`, `fragmento-citado-en-panel.tsx` (reutiliza `citation-details.tsx`) y `dato-del-paciente-en-panel.tsx` (reutiliza `procedencia-del-dato`, `historico-del-dato`) con lectura por `/api/patients/{id}/case` y `…/history`; AC-2 y bordes en verde; commit `feat(L1D-325)`
- [ ] 1.9 Extraer `rutaDeHistorico(resourceType, resourceId)` en `apps/web/lib/caso/` como función pura sobre `/api/*` con su unitario (biomarcador, atributo, tratamiento previo, nota → tramo `…/{resourceId}/history`; diagnóstico y tipo desconocido → `null`); lee el `ConversationDataLink`, sin `historyPath`
- [ ] 1.10 Implementar «Expandir todo / Plegar todo» con estado local y `React.memo` de la tarjeta, `aviso-de-afirmaciones-omitidas.tsx` y `referencias-del-turno.tsx` (enlace según el requisito de L1D-266 con `esUrlHttpSegura()`, sin regla propia ni segunda comprobación; Markdown, si lo hay, sin `rehype-raw`, con `rehype-sanitize` y `urlTransform` vía `esUrlHttpSegura()`); textos nuevos en `lib/mensajes.ts`; AC-3, AC-4, AC-5 en verde; commit `feat(L1D-325)`
- [ ] 1.11 Textos nuevos pasan el lint de términos prohibidos (RN-23) y el aviso RN-19 sigue en cada turno (regresión de `l1d-324-panel-conversacional`)
- [ ] 1.12 Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px; cada fallo se convierte primero en un test en rojo. Incluye: cita → panel con el fragmento enfocado, «Ver en el caso» → dato resaltado, `Esc` devuelve el foco, panel a pantalla completa en 375 px, sin *scroll* horizontal de página, axe sin `serious` ni `critical`
- [ ] 1.13 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-325)`

## 2. cierre

- [ ] 2.1 `openspec validate l1d-325-chat-fuentes-sin-perder-contexto --strict`, tests de `apps/web` (Vitest) y E2E de AC-1/AC-2 en verde; sin `contracts:verify-provider` (sin cambios de API) ni `run-ai-eval` (sin modelo, prompt, umbral, catálogo ni corpus)
