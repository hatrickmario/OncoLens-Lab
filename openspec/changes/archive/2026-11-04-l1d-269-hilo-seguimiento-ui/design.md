# Design — l1d-269-hilo-seguimiento-ui

## Context

Ver proposal.md (Why). Estado en `main`:

- **Contrato congelado** (US-033 AC-13): `POST/GET /platform/evidence-analyses/{analysisId}/follow-ups`, `FollowUpCreate
  {question}`, `FollowUpTurn` (`turnNumber`, `question` enmascarada, `status ∈ {con_evidencia, sin_evidencia,
  fuera_de_contexto}`, `answer: SupportedClaim[]` con `citedSources` y `patientDataRefs`, `citedSources:
  FollowUpCitedSource[]` con `isNewSource`, `omittedClaims`, `patientDataLinks`, `disclaimer`), `409
  ErrorLimiteSeguimiento`, `422 ErrorSeguimientoNoProcesable`, `403`, `429`, `502`, `503`, `504`. Ejemplos:
  `follow-up-create.json`, `follow-up-turn.json`, `follow-up-fuera-de-contexto.json`, `error-limite-seguimiento.json`;
  `l1d-268` añade `follow-up-sin-evidencia.json`.
- **`web`**: `EvidencePanel` es la única frontera `'use client'` del panel; `AnalysisResult` pinta el resultado;
  `AiDisclaimer` muestra el `disclaimer` de la respuesta sin texto propio; `AppHeader` muestra `app.academicUseLabel`;
  `CitationChip`, `CitedFragment` y `CitationDetails` pintan citas y metadatos del catálogo («No disponible» si faltan);
  `crearManejadorAnalisis` (`lib/server/evidence-analyses.ts`) es el patrón del proxy (Origin → tope → SDK →
  `retransmitir`). Textos en `messages/es.json`.
- **El tope** `ANALYSIS_FOLLOWUP_MAX` llega en `AnalysisBasis.maxFollowUps`, que añade `l1d-268` (contrato y
  `clinical-api`, `[S5 resp. 10]`): el contador «n de 10» y el texto del `409` («límite de 10 preguntas») lo leen de ahí
  sin duplicar la configuración (RN-22).

Diseño de referencia: `docs/ux/S5/pantallas-s5.md` **S5-04** (un solo diseño; extiende la pantalla 09 punto 9 de
`docs/ux/flujo-e2e.md`) y `docs/ux/sistema-de-diseno.md` (organismo `FollowUpThread`, §4 accesibilidad). Sin desviaciones.
Los supuestos de D1, D3, D4, D5 y D6 quedan **Decidido (usuario, 2026-11-03)** `[S5 resp. 13]`; la nota de citas de D5
se corrigió en el Gate 1.

## Goals / Non-Goals

**Goals:** el hilo de S5-04 completo en el panel, con su Route Handler BFF, los estados de AC-4, accesibilidad de AC-5 y
el tope leído del contrato, no de un literal.

**Non-Goals:** backend del seguimiento (US-218); `GET …/follow-ups` en `web` (S6, historial); ampliar antigüedad (US-220);
feedback (S6); progreso real por eventos (ADR-42).

## Decisions

### D1 · De dónde sale el tope del contador · **Decidido (usuario, 2026-11-03)** `[S5 resp. 10]`

El contador y el texto del límite leen `analysisBasis.maxFollowUps`, que `l1d-268` añade al contrato y llena desde
`ANALYSIS_FOLLOWUP_MAX` (valor vigente al crear el análisis). Este change **solo lo consume**: ni contrato ni
`clinical-api`. El número es informativo; la autoridad es el `409 LIMITE_SEGUIMIENTO`. Un análisis histórico sin
`maxFollowUps` muestra «n preguntas usadas» sin total.

*Descartadas:* variable propia de `web` (dos dueños de la configuración, RN-22); contador sin total hasta el `409`
(incumple AC-1 y S5-04).

### D2 · El Route Handler es un proxy transparente, igual que el del análisis

`crearManejadorSeguimiento()` en `lib/server/follow-ups.ts`: `verificarOrigen` → validar `analysisId` como UUID (si no,
`404` propio con forma `ErrorNoEncontrado`, sin llamar a `clinical-api`) → `leerCuerpoAcotado` → `createFollowUp` del SDK
generado con el cuerpo sin reserializar → `retransmitir` (status, cuerpo y `Retry-After`/`X-Trace-Id`). `502` propio si
`clinical-api` no responde. Sin validación del cuerpo en el BFF (la del borde es de `clinical-api`, como en D1 de
US-060); sin streaming; `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`. El `analysisId` va en la **ruta** (es un UUID,
no PII); la pregunta solo en el cuerpo.

### D3 · Estado del hilo en el cliente, autoritativo desde el servidor

`FollowUpThread` es client component montado dentro de la frontera `'use client'` existente (`EvidencePanel` →
`AnalysisResult`), keyed por `analysisId`: un análisis nuevo vacía el hilo. Guarda la lista de turnos recibidos y la
fase (`inactivo | enviando | error | limite`). El contador usa `turnNumber` del último turno (no un conteo local); tras
un `409` el contador pasa a `maxFollowUps` y el campo se deshabilita con el texto del límite. Una sola petición en curso
(guarda síncrona `useRef`, mismo patrón que el panel). El hilo arranca vacío: sin `GET`, porque el panel no relee
análisis en el S5 (el historial es del S6).

### D4 · Respuesta completa o nada (TBD-08)

Mientras `enviando`: un `role="status"` con los pasos de S5-04 («Buscando evidencia…», «Validando citas…») como texto
de progreso fijo, el botón deshabilitado y **ningún** contenido de turno nuevo. El turno se añade al historial solo con un
`201` parseado contra el tipo generado. Como no hay eventos de progreso (ADR-42 sin decidir), los pasos no dicen cuál
está en curso: son una descripción del proceso, no un avance real.

### D5 · Qué muestra cada turno

- Pregunta («Pregunta n · <question>», la versión enmascarada que devuelve el servidor).
- `con_evidencia`: una línea por `SupportedClaim` con sus chips de cita `[k]` (numerados sobre `citedSources` del turno)
  y «ver fragmento» que abre `CitedFragment` con `chunkTextSnapshot` y los metadatos del catálogo; la marca «nueva en el
  seguimiento» junto a la cita con `isNewSource = true`. La nota «Cada afirmación cita un fragmento del corpus recuperado para esta pregunta o enlaza a un dato del paciente. Fuente, año y población: del catálogo, o «No disponible».»
  Si `omittedClaims > 0`, solo el número (patrón de la Base).
- «Base de esta respuesta: datos del paciente usados · ausentes: …» con `patientDataUsed` y `missingCriticalDataLabels`
  de la `analysisBasis` del análisis de origen (es el contexto fijo; el turno no trae Base propia).
- Aviso: `AiDisclaimer` con `turn.disclaimer` y la etiqueta `app.academicUseLabel`, **en cada turno**, también en
  `sin_evidencia` y `fuera_de_contexto` (mismo criterio que US-069 AC-4).
- `sin_evidencia` y `fuera_de_contexto`: el texto literal de S5-04 y el botón «Nuevo análisis»; sin citas ni afirmaciones.
- Texto del LLM y del corpus como texto React (nunca `dangerouslySetInnerHTML`).

### D6 · «Nuevo análisis» y errores

«Nuevo análisis» lleva el foco al campo de pregunta del panel (`EvidenceQueryForm`) sin borrar el análisis actual; el
siguiente envío del panel abre un análisis nuevo y vacía el hilo (D3). Los demás errores del POST reutilizan la
clasificación del panel (`clasificarFallo`, `AnalysisFailure`): `401` → login, `429` con plazo, `5xx`/red → «No se pudo
completar…» con el código de traza, sin detalles ni respuesta parcial; `422` → mensaje junto al campo.

## Componentes y patrones

| Componente | Nivel | Concepto | RSC / client |
|---|---|---|---|
| `FollowUpThread` | organismo | encabezado, contador, contexto, historial, formulario y fase | client (dentro de la frontera de `EvidencePanel`) |
| `FollowUpContext` | molécula | recuadro «Contexto fijo de esta conversación» | sin estado |
| `FollowUpTurnItem` | molécula | un turno: pregunta, afirmaciones con citas, nota, Base, aviso | sin estado |
| `FollowUpStateNotice` | molécula | texto de `sin_evidencia`, `fuera_de_contexto` o límite + «Nuevo análisis» | sin estado |
| `FollowUpForm` | molécula | `<label>` visible, campo, «Preguntar», error junto al campo | sin estado (controlado) |

Cada uno ≤ 100 líneas (alerta) y < 150 (límite). Lógica pura en `lib/evidence/seguimiento/`: `solicitarSeguimiento()`
(fetch al Route Handler y clasificación), `faseTrasSeguimiento()`, `contadorDeSeguimiento()` y `numerarCitasDelTurno()`.
**Sin patrones nuevos**: ni custom hook (un solo consumidor), ni provider, ni compound components (YAGNI). Se reutilizan
`CitationChip`, `CitedFragment`, `CitationDetails`, `AiDisclaimer`, `AnalysisFailure` y `ui/{button,input,label,card}`.

## Criterios de verificación por AC

| AC | Nivel | Dónde |
|---|---|---|
| AC-1 | Componente (Testing Library + MSW desde `contracts/examples/`) | `apps/web/tests/ui/hilo-seguimiento.test.tsx` |
| AC-2 | Componente | ídem (con `follow-up-turn.json`) |
| AC-3 | Componente (respuesta MSW retenida hasta liberarla) | `hilo-seguimiento-espera.test.tsx` |
| AC-4 | Componente (`409`, `sin_evidencia`, `fuera_de_contexto`) | `hilo-seguimiento-estados.test.tsx` |
| AC-5 | Componente (`aria-live`, `<label>`, teclado) + `visual-check` 375/1280 | ídem + evidencia en el PR |
| BFF | Integración del Route Handler (MSW hacia `clinical-api`, `assertMatchesSpec`) | `apps/web/tests/api/follow-ups.test.ts` |

El campo `maxFollowUps` en `clinical-api` lo verifica `l1d-268` (`base-max-follow-ups.test.ts`).

E2E (Playwright, LLM fingido): **no** en este change; el recorrido con 2 preguntas lo cubre US-142 (G-Demo, O4).

## Privacidad y ownership

- **Fronteras:** navegador → `web` (`/api/evidence-analyses/{id}/follow-ups`, mismo origen) → `clinical-api` con la cookie
  de sesión. `web` nunca habla con `rag-orchestrator`; la sesión no cruza a Backend 2 (lo hace `l1d-268` con JWT de
  servicio). Este change no toca `rag-orchestrator`, datos clínicos de Backend 2 ni `clinical-minio`.
- **RN-10/RN-11:** el navegador solo ve la pregunta **enmascarada** que devuelve el servidor y el `analysisId` (UUID). Ni
  identidad ni `pseudoPatientId` llegan a la UI. La URL lleva solo UUID; la pregunta va en el cuerpo, nunca en query
  string. Los logs del BFF registran evento, status, duración y `traceId`, nunca el cuerpo.
- **`maxFollowUps`** (D1): entero de configuración, sin PII.
- **Fixtures:** solo `contracts/examples/` (sintéticos) y el seed sintético en `visual-check`.

### Seguridad web

- **Validación:** el BFF no valida el cuerpo (proxy transparente, D2); el cliente valida longitud con el Zod compartido
  (`esquemaPreguntaNormalizada` de `l1d-306` o el `zFollowUpCreate` generado) y el servidor manda.
- **CSRF:** `verificarOrigen` (Origin exacto) antes de leer cuerpo o cookie; cookie `SameSite=Strict`.
- **`NEXT_PUBLIC_`:** ninguna nueva. Módulos del Route Handler con `import 'server-only'`.
- **Render:** texto del LLM y del corpus como nodos de texto React; `sourceUrl` solo como `href` con el mismo saneado de
  `CitationDetails` (sin `javascript:`). Sin HTML crudo.
- **CSP y cabeceras:** sin cambios (sin scripts ni orígenes nuevos). **Dependencias:** ninguna nueva.

## Contratos

Sin cambios de contrato. Consumidor de `clinical-api` vía el cliente generado (`packages/api-contracts`): usa
`AnalysisBasis.maxFollowUps` (opcional) que añade `l1d-268` `[S5 resp. 10]`, y los ejemplos de US-033 más
`follow-up-sin-evidencia.json` de `l1d-268`. Generados solo con `contracts:generate` (los regenera `l1d-268`).

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `apps/web/app/api/evidence-analyses/[analysisId]/follow-ups/route.ts` | nuevo: `POST` | `crearManejadorSeguimiento` |
| `apps/web/lib/server/follow-ups.ts` | nuevo: proxy (D2) | `verificarOrigen`, `leerCuerpoAcotado`, `retransmitir`, SDK generado (`createFollowUp`) |
| `apps/web/lib/evidence/seguimiento/*.ts` | nuevo: `solicitarSeguimiento()`, `faseTrasSeguimiento()`, `contadorDeSeguimiento()`, `numerarCitasDelTurno()` (puras salvo el fetch) | tipos generados, `clasificarFallo` |
| `apps/web/components/organisms/follow-up-thread.tsx` | nuevo | moléculas nuevas y existentes |
| `apps/web/components/molecules/follow-up-*.tsx` | nuevos (4) | `ui/*`, `CitationChip`, `CitedFragment`, `AiDisclaimer` |
| `apps/web/components/organisms/analysis-result.tsx` | monta `FollowUpThread` tras la Base, solo si `status = con_evidencia` | — |
| `apps/web/messages/es.json` | claves `followUp.*` con los literales de S5-04 | — |

Reglas con nombre propio: `contadorDeSeguimiento()` (usados = `turnNumber` del último turno; total = `maxFollowUps` o
ninguno). Antes del PR: buscar `ANALYSIS_FOLLOWUP_MAX`, `10` en textos y el literal del aviso RN-19 en `apps/web` para no
duplicarlos (el aviso sale del `disclaimer`; el 10, del contrato). **Fakes:** ninguno nuevo; los handlers MSW se construyen
desde `contracts/examples/` (`tests/support/msw`).

## Risks / Trade-offs

- [`l1d-268` no mergeado a tiempo] → los tests de `web` solo esperan al commit `contract(L1D-268)` (tipo generado y
  ejemplo con `maxFollowUps`); `visual-check` espera al change completo.
- [Pasos de progreso interpretados como reales] → texto fijo de proceso, sin marcar un paso como actual (D4).
- [Hilo perdido al recargar] → aceptado en el S5 (D3); el historial llega en el S6.

## Migration Plan

Sin migración. Despliegue normal; *rollback* = revertir el PR (`maxFollowUps` es opcional en la lectura).

## Open Questions

Ninguna abierta. Resueltas en el Gate 1 (usuario, 2026-11-03): D1 → `maxFollowUps` en `l1d-268`, este change lo consume
`[S5 resp. 10]`; Base de la respuesta (D5) y «Nuevo análisis» con foco en el campo de pregunta (D6) → decididos
`[S5 resp. 13]`; nota de citas corregida (D5).
