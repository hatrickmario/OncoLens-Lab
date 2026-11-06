# Tasks — l1d-324-panel-conversacional

> Empieza cuando ADR-51 §8 tiene la anotación de `l1d-314-spike-assistant-ui` y el contrato y los Route Handlers de
> `l1d-315-conversacion-paciente` (`ConversationTurn` en `packages/api-contracts/`, `contracts/examples/conversation-*.json`)
> están en `main`; el AC-3 (turno de evidencia sobre `turn.evidenceAnalysis`) requiere además `l1d-322-chat-evidencia-seguimiento`
> mergeado (`ConversationTurn.evidenceAnalysis?`, clinical-api 1.26.0). P-1 decidido [S6 resp. 20]: el chat sustituye al formulario de una pregunta en `/analisis` y sus requisitos se
> retiran en este change (lo confirma el humano en el plan). Vocabulario: `backlog/sprints/S6-glosario-chat.md`.

## 0. Preparación

- [ ] 0.1 Leer ADR-51 §8 y el reporte `docs/evidence/S6-spike-assistant-ui/README.md`; anotar en design.md D1 la opción aplicada (assistant-ui o shadcn) · sin test
- [ ] 0.2 Si ganó assistant-ui: añadir `@assistant-ui/react` 0.15.32 (versión exacta) a `apps/web/package.json`, `npm install` y comprobar que `npm audit` no añade alertas · test después (build y suite de `web` en verde)

## 1. docs — sistema de diseño

- [ ] 1.1 Añadir a `docs/ux/sistema-de-diseno.md` §1 «Color» las filas `--color-clinical` (`#0E5A5F` sobre `#E1F1F1`, borde `#7FB9BC`, 6,8:1, «Información clínica del paciente») y `--color-evidence` (`#1F4FB8` sobre `#E8EEFA`, borde `#9DB3E3`, 6,3:1, «Evidencia científica (corpus)»), con la nota de que el color nunca es la única señal (◆ / ▤ + rótulo) y que los bordes de componente usan el tono base (≥ 3:1); y en §2 los componentes nuevos (`ConversationPanel`, `ConversationTurnCard`) · sin test
- [ ] 1.2 Declarar los mismos tokens en `apps/web/app/globals.css` · test después (cubierto por `visual-check` 4.2)

## 2. frontend — tests del AC primero (Testing Library + MSW desde `contracts/examples/`)

- [ ] 2.1 Tests en rojo, con nombres `[US-267 AC-n]`: AC-2 (cada tarjeta pinta literalmente su `turn.notices[]` y no los toma de la configuración; mensajes del sistema sin avisos de IA; «Opciones descritas en la evidencia» solo en la de evidencia; bloque `interpretacion` con «Interpretación generada por IA» y sin «◆ Información clínica del paciente»; textos fijos sin términos de `terminos-prohibidos.json`), AC-3 (sin «Preguntas de seguimiento sobre este análisis», sin «de 10 preguntas usadas», cero peticiones a `…/follow-ups` con un `evidenceAnalysis` `con_evidencia`), AC-4 (respuesta retenida 3 s con `vi.useFakeTimers`: «Analizando…» en `role="status"`, botón deshabilitado, sin texto de `blocks`; doble envío = una petición), AC-5 (`503 sin_conexion_con_rag`: «No se pudo completar la respuesta», «Reintentar», pregunta y turno previo visibles, sin `503` en pantalla; «Reintentar» reenvía la misma `question`) y AC-7 parcial (`role="log"` + `aria-live="polite"`, `<label>` visible); Markdown hostil (`<img src=x onerror=alert(1)>` y `[x](javascript:alert(1))` en un bloque: sin `img` ni `href` inseguro); RN-15 (`disabled` y `403 PermisoDenegadoOOptOut`: campo y «Preguntar» deshabilitados, ningún `POST` y ningún turno); esqueletos `ConversationPanel`/`ConversationTurnCard` que lanzan `new Error('no implementado')` para que el rojo falle en la aserción · commit `test(L1D-324)`
- [ ] 2.2 Test E2E en rojo (Playwright contra Compose, seed sintético, `LLM_PROVIDER=fake`): AC-1 (paciente semilla (a), tres preguntas en la misma conversación → tres tarjetas en orden con chips de intención, enlaces ◆ en caso y faltantes, cita `[E1]` en evidencia, mismo `conversationId`), AC-6 (todas las peticiones al origen de `web`, rutas `/api/patients/…/conversations` o `/api/conversations/…`, sin la pregunta en la URL) y AC-7 (axe sin `serious`/`critical` con tres turnos; Tab + Enter envía un cuarto turno) · commit `test(L1D-324)`

## 3. frontend — implementación

- [ ] 3.1 `ConversationPanel` (Client Component) con la prop `disabled` (RN-15, la consume L1D-213), el estado de la conversación, apertura perezosa (`POST /api/patients/{id}/conversations` al primer envío), «Nueva conversación», fases `inactivo → enviando → respondido | error` y una sola petición en curso; composer con `<label>` visible, Enter envía, fijo abajo y no fijo bajo 480 px · AC-4, AC-5 en verde · commit `feat(L1D-324)`
- [ ] 3.2 `ConversationTurnCard` y moléculas (cabecera con `turnNumber`, `createdAt` y chip de intención; bloque por `blocks[].kind` con rótulo ◆/▤ y «Interpretación generada por IA» para `interpretacion`; chip de dato resuelto contra `dataLinks`; línea «Datos usados · Ausentes» con `dataUsed`/`dataMissing`; avisos solo de `turn.notices[]`); lectura tolerante de campos y `kind` desconocidos; Markdown sin `rehype-raw`, con `rehype-sanitize` y `urlTransform` vía `esUrlHttpSegura()` (L1D-266) · AC-1 (unitarios), AC-2 en verde · commit `feat(L1D-324)`
- [ ] 3.3 Turno de evidencia: cuerpo = `AnalysisResult` sobre `turn.evidenceAnalysis`, con «Opciones descritas en la evidencia»; quitar `FollowUpThread` de `analysis-result.tsx` · AC-3 en verde · commit `feat(L1D-324)`
- [ ] 3.4 Montar `ConversationPanel` en `app/(dashboard)/pacientes/[id]/analisis/page.tsx` en lugar de `EvidenceQueryForm` (P-1 decidido [S6 resp. 20]; si el humano no lo confirma, debajo del formulario); textos nuevos en `lib/mensajes`; AC-1, AC-6 y AC-7 (E2E) en verde · commit `feat(L1D-324)`
- [ ] 3.5 Borrar `organisms/follow-up-thread.tsx`, las moléculas `follow-up-*` y `lib/server/follow-ups.ts` (si no tienen otro consumidor) con sus tests de UI; con P-1 confirmado, también `EvidenceQueryForm`, el aviso de faltantes previo al análisis y sus tests de UI (sus requisitos se retiran en el delta); trailer `Test-Removal: US-219 y formulario de pregunta única retirados por US-267 (delta de evidence-panel)` en el último párrafo junto a `Co-Authored-By`; conservar `tests/api/follow-ups.test.ts` y el Route Handler `…/follow-ups` · commit `refactor(L1D-324)`
- [ ] 3.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después · commit `refactor(L1D-324)`

## 4. Verificación

- [ ] 4.1 Suite de `web` (Vitest) y E2E de Playwright en verde; `npm run build` con Turbopack en verde
- [ ] 4.2 `visual-check` (skill) tras el verde de los AC y antes del refactor: estados vacío, enviando («Analizando…»), turnos de caso, faltantes y evidencia, error con «Reintentar»; consola sin errores ni violaciones de CSP, red solo `/api/*` del mismo origen sin la pregunta en la URL, teclado, capturas a 375 y 1280 px sin *scroll* horizontal, tokens `--color-clinical`/`--color-evidence` aplicados; evidencia en `docs/evidence/` para el Gate 2
- [ ] 4.3 `openspec validate l1d-324-panel-conversacional --strict` en verde
- [ ] 4.4 Sin `run-ai-eval`: el change no toca modelo, prompt, umbral, catálogo ni corpus
