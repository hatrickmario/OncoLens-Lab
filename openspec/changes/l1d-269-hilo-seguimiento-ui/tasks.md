# Tasks — l1d-269-hilo-seguimiento-ui

> US-219 · L1D-269 · Sprint 5, oleada O2 (después del commit `contract(L1D-268)` de `l1d-268-seguimiento-analisis`).
> Matriz TDD de `CLAUDE.md`: componentes y Route Handler simple de `web` → **test del AC primero** (Testing Library + MSW
> desde `contracts/examples/`, commit `test(L1D-269)` en rojo antes del `feat`) y `visual-check`. Sin contrato ni
> `clinical-api`: `AnalysisBasis.maxFollowUps` lo añade `l1d-268` y aquí solo se consume `[S5 resp. 10]`. Sin
> `openapi.yaml`: admite PR de lote (D-12 `[S5 resp. 7]`). Solo datos sintéticos. Sin `## humano`:
> `ANALYSIS_FOLLOWUP_MAX` en `.env.example` ya es `H-1` de `l1d-268`.

## 1. clinical-platform

- [ ] 1.1 Tests del Route Handler en rojo: «retransmite el turno 201 con solo la cookie de sesión [US-219 AC-2]»,
      «retransmite el 409 de límite sin reinterpretar [US-219 AC-4]», «rechaza otro origen sin contactar a clinical-api»,
      «responde 404 propio a un analysisId que no es UUID» y «responde 502 propio sin URL interna si clinical-api no
      responde» · integración (Vitest + MSW hacia `clinical-api` desde `contracts/examples/`, `assertMatchesSpec`) en
      `apps/web/tests/api/follow-ups.test.ts`; commit `test(L1D-269)` · **test del AC primero**
- [ ] 1.2 Implementar `crearManejadorSeguimiento()` en `apps/web/lib/server/follow-ups.ts` (`server-only`; reutiliza
      `verificarOrigen`, `leerCuerpoAcotado`, `retransmitir` y el SDK generado `createFollowUp`) y
      `apps/web/app/api/evidence-analyses/[analysisId]/follow-ups/route.ts` (`runtime = 'nodejs'`,
      `dynamic = 'force-dynamic'`). Tests 1.1 en verde; commit `feat(L1D-269)` · **test del AC primero**
- [ ] 1.3 Suite de `web` (`tests/api`) en verde · **verificación**
- [ ] 1.4 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
      antes y después, commit refactor(L1D-269)

## 2. frontend

- [ ] 2.1 Tests del AC en rojo (Testing Library + MSW desde `contracts/examples/`, sobre `/api/evidence-analyses/*`):
      AC-1 (encabezado, contexto fijo, «0 de 10 preguntas usadas», sin hilo en `sin_evidencia`, sin total si falta
      `maxFollowUps`) y AC-2 (citas con «ver fragmento», «nueva en el seguimiento» solo en `chunk_90412`, «No
      disponible», la nota de citas con el texto corregido en el Gate 1 (design D5), `disclaimer` del turno y etiqueta académica en cada turno, texto no interpretado como
      HTML) en `apps/web/tests/ui/hilo-seguimiento.test.tsx`; commit `test(L1D-269)` · **test del AC primero**
- [ ] 2.2 Tests del AC en rojo: AC-3 (progreso sin `answer` con la respuesta retenida, una sola petición ante doble
      clic) en `hilo-seguimiento-espera.test.tsx`; AC-4 (`409` con el límite de `maxFollowUps` y campo deshabilitado,
      `sin_evidencia`, `fuera_de_contexto`, «Nuevo análisis» con foco en el campo del panel, `502` sin turno) y AC-5
      (`aria-live="polite"`, `<label>` visible, teclado) en `hilo-seguimiento-estados.test.tsx`; commit
      `test(L1D-269)` · **test del AC primero**
- [ ] 2.3 Extraer `contadorDeSeguimiento()` (RN-22: usados = `turnNumber` del último turno; total =
      `analysisBasis.maxFollowUps` o ninguno) y `numerarCitasDelTurno()` en `apps/web/lib/evidence/seguimiento/`, con
      unitarios Vitest uno a uno · **test del AC primero**
- [ ] 2.4 Implementar `solicitarSeguimiento()` y `faseTrasSeguimiento()` (reutilizan `clasificarFallo`), las moléculas
      `FollowUpContext`, `FollowUpTurnItem`, `FollowUpStateNotice`, `FollowUpForm` y el organismo `FollowUpThread`
      (reutilizan `CitationChip`, `CitedFragment`, `AiDisclaimer`, `AnalysisFailure`, `ui/*`), las claves `followUp.*`
      de `messages/es.json` con los literales de S5-04, y montarlo en `analysis-result.tsx` tras la Base solo con
      `con_evidencia`, keyed por `analysisId`. Validación del campo con `esquemaPreguntaNormalizada` (si `l1d-306` está en
      `main`) o el `zFollowUpCreate` generado. Tests 2.1 y 2.2 en verde; commit `feat(L1D-269)` · **test del AC primero**
      `[US-219 AC-1…AC-5]`
- [ ] 2.5 Suite de `web` (Vitest) y lint en verde; buscar en `apps/web` `ANALYSIS_FOLLOWUP_MAX`, un `10` en textos y el
      literal del aviso RN-19 para confirmar que no se duplican · **verificación**
- [ ] 2.6 Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en URLs,
      accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px; cada fallo se convierte primero en un test en rojo
      (⛔ necesita `l1d-268` en `main` y el Compose con `LLM_PROVIDER=fake`) `[US-219 AC-5]`
- [ ] 2.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
      antes y después, commit refactor(L1D-269)

## 3. cierre

- [ ] 3.1 `openspec validate l1d-269-hilo-seguimiento-ui --strict` y tests de `web` en verde; sin
      `contracts:verify-provider` (no cambia la API) ni `run-ai-eval` (no cambia modelo, prompt, umbral, catálogo ni
      corpus) · **verificación**
