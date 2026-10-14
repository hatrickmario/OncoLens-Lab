# Proposal — l1d-140-panel-opcion-citas

## Trazabilidad

L1D-140 · US-061 · FEAT-10a (L1D-23) · Sprint 1 · Estimación **5** · HU-03 · Ticket OL-04 ·
FR-09 (UI del S1), FR-10 (sección de descartadas en la UI), RN-03 (dueña), RN-28 (texto del criterio,
neutro en S1–S2), NFR-12 (panel) · AC-10.1 (S1), AC-10.2 (S1), AC-10.4, AC-05.3 (UI) ·
US-061 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6 · 🔗 Consume: US-064 (descartadas, L1D-180), US-069 (aviso de
IA, L1D-194), US-068 (términos prohibidos, L1D-193) · 🔗 Regresión [RN-28] (selección y texto por
aplicabilidad) → US-125, US-126 AC-7, activa desde S5 · 🔗 Medido en: US-072 (M-10.1, M-10.2) ·
DoR del S1: ✓ (`backlog/sprints/S1-refinamiento.md` §1; diseño en `docs/ux/S1/pantallas-s1.md`, S1-08/09).

> **Decidido (usuario, 2026-10-13, `[S1 resp. 4]`):** rutas en español del diseño aprobado. El panel
> vive en `/pacientes/[id]/analisis`, página `app/(dashboard)/pacientes/[id]/analisis/page.tsx`. No hay
> `GET /platform/evidence-analyses/{id}`: en el S1 el resultado se muestra **en la misma página tras el
> POST** (sin URL propia del resultado, que llega con el historial, `si-hay-capacidad`).
>
> **Decidido (usuario, 2026-10-13, `[S1 resp. 8]`):** la "traducción opcional etiquetada" de las citas
> (PRD §12 Idioma, readme OL-04, V-10) queda **fuera del MVP comprometido** (Post-MVP, sin historia);
> la cita y su fragmento se muestran en su idioma original (US-063 AC-6). Registrado en
> `FEAT-10a`, `## Conflictos de fuentes`.
>
> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos "(asumido)" de los AC se aceptan.
> Contexto aplicable también: `[S1 resp. 9]` (literal del aviso con dos puntos, solo esa frase en
> `disclaimer`; lo implementa L1D-194) y `[§15 resp. 7]` (texto del criterio en S1–S4).
>
> **Decidido en el Gate 1 (usuario, 2026-10-14, `backlog/sprints/S1-plan.md` §2):**
> - `[S1 resp. 18]` dueños únicos: `AiDisclaimer`, `AppHeader` y el *layout* `(dashboard)` son de L1D-194
>   (este change **solo los compone**); `apps/web/messages/es.json` lo crea L1D-197;
>   `contracts/examples/evidence-analysis-request.json` lo crea L1D-139. El E2E del AC-1 lee `externalId`
>   de `rag-query-con-evidencia.json` (no fija "CDR-TEST-001").
> - `[S1 resp. 16]` el motivo `afirmacion_sin_soporte` en la UI aclara "o contenía lenguaje no permitido"
>   (el enum no cambia).
> - `[S1 resp. 15]` / L1D-193: `data-origen="corpus"` solo en **hojas** de la allowlist de campos del
>   corpus de `packages/clinical-language` (con `data-campo`).
> - Correcciones del Gate 1: el rótulo del valor de relevancia es exactamente "Relevancia de la
>   evidencia" (`data-testid`), con la nota negada "no mide eficacia ni solidez clínica" permitida; se
>   añaden escenarios de los estados `sin_evidencia`, error de transporte y "solo descartadas" del diseño
>   S1-08/09; el Route Handler de L1D-139 **no** revalida con Zod (lo valida `clinical-api`).

## Why

El walking skeleton no es demostrable sin la pantalla que el oncólogo usa: escribir una pregunta y leer
un análisis en el que la opción descrita trae sus fuentes verificables, la relevancia no se confunde con
eficacia y lo que no se pudo respaldar queda aparte, solo para revisión (AS-IS P5, P6, P12). RN-03 es de
esta historia: la relevancia es un metadato secundario y la UI es donde ese límite se pierde o se
mantiene.

## What Changes

- **Nueva página** `apps/web/app/(dashboard)/pacientes/[id]/analisis/page.tsx` (RSC) con `h1` "Análisis
  de evidencia", barra mínima "Paciente · ID [8 primeros caracteres]" tomada del parámetro de ruta (sin
  identidad ni PHI) y el panel: formulario arriba y resultado debajo, layout C (columna principal +
  `aside` "Fragmento citado"; apilado a 375 px).
- **Formulario** (`'use client'`): `textarea` "Pregunta clínica" con label, ayuda y contador por
  `aria-describedby`, botón `submit` "Analizar evidencia" (con `aria-disabled` y "Analizando…" mientras
  espera). Envía `POST /api/evidence-analyses` (Route Handler de L1D-139) con `patientId`, `query` y
  `sourcesSelected` con las tres fuentes en `true` (sin selectores hasta el S3), validado con el schema
  Zod **generado** de `EvidenceAnalysisRequest`.
- **Composición** de `AiDisclaimer` (con el campo `disclaimer` de la respuesta, antes del encabezado y en
  el pie) y del layout `(dashboard)` con `AppHeader`, ambos de L1D-194; no se crean aquí.
- **Resultado** por estado de la respuesta: con opción (encabezado "Opciones descritas en la evidencia",
  texto del criterio neutro, tarjeta con `option`, `rationale`, chips de cita y, al final, "Relevancia de
  la evidencia 0,87" en estilo secundario), solo descartadas (sección colapsada "Descartadas por falta de
  soporte — solo para revisión"), y sin opciones (ni encabezado ni descartadas). Anuncio breve en una
  región `role="status"` (`aria-live="polite"`) fuera del contenedor del resultado.
- **Citas:** chip `sourceName` · `externalId`; al expandirlo, metadatos del catálogo (ausente → "No
  disponible", RN-25), "Ver fragmento" (abre `chunkTextSnapshot` en su idioma original, con `lang`) y
  "Fuente original". Solo los nodos **hoja** con texto copiado del corpus, de la allowlist
  `CAMPOS_COPIADOS_DEL_CORPUS` de `packages/clinical-language` (L1D-193), llevan `data-origen="corpus"` y
  `data-campo="<campo>"`; nunca un contenedor ni texto generado.
- **Textos** de UI en `apps/web/messages/es.json` (archivo creado por L1D-197, `[S1 resp. 18]`) bajo
  `evidence.*` (incluidas `evidence.orderCriterion.relevance` y `evidence.discardReason.*`, con
  `afirmacion_sin_soporte` = "Una afirmación no tiene soporte en la fuente o contenía lenguaje no
  permitido", `[S1 resp. 16]`), sujetos a `lint:lenguaje` de L1D-193.
- **Estados mínimos del S1** (diseño S1-08/09): `sin_evidencia` con "Relevancia máxima: no aplica" (RN-02)
  y error de transporte sin resultado parcial (RN-06), con escenarios propios.
- **Ejemplos nuevos del contrato** (no normativos, sin cambio de spec): `EvidenceAnalysis` "solo
  descartadas" y "sin opciones" (MSW de los tests de componente) y sus pares
  `RagQueryInternalResponse` con su request de *fixture* (modo `LLM_PROVIDER=fake` de L1D-164, para los
  E2E).

## Capabilities

### New Capabilities

- `evidence-panel`: presentación del análisis de evidencia en `web` (formulario, estados del resultado,
  opción, citas, relevancia secundaria, descartadas y accesibilidad del panel). **Justificación:** la
  lista de `openspec/config.yaml` no tiene una capacidad de UI; `evidence-analysis` describe el pipeline
  de los backends (L1D-106, L1D-179, L1D-180, L1D-275) y `human-control` el lenguaje no prescriptivo y
  los avisos (L1D-193, L1D-194). Mezclar los requisitos de render en cualquiera de ellas duplicaría o
  redefiniría su Purpose.

### Modified Capabilities

- Ninguna. No se modifica ningún requisito de `openspec/specs/` (`api-contracts` y `data-model` quedan
  intactos: los ejemplos nuevos no cambian el spec).

## Bounded contexts

- **frontend** (principal): página, componentes y textos de `apps/web`.
- **contratos**: ejemplos nuevos en `contracts/examples/` y su registro en `index.json` (sin editar
  `openapi.yaml`).
- clinical-platform y ai-services: no se tocan (el Route Handler es de L1D-139).

## Dependencias

- ↪ `l1d-139-bff-route-handler-analisis` (US-060): `POST /api/evidence-analyses` y
  `contracts/examples/evidence-analysis-request.json` `[S1 resp. 18]`, que usan los tests de
  `solicitarAnalisis`. Los tests de componente no necesitan el Route Handler (MSW sobre `/api/*`); los E2E
  sí.
- ↪ `l1d-197-sesion-login-guard` (US-211): login, `proxy.ts` sobre `/pacientes/:path*` y
  `apps/web/messages/es.json` `[S1 resp. 18]`; los E2E entran con `doc1@test.local`.
- ↪ `l1d-104-persistencia-analisis-fallos` y `l1d-103-gateway-contexto-clinico` (US-053): respuesta del
  gateway en el E2E.
- ↪ `l1d-164-compose-stack` (US-034 AC-6): perfil de test con `LLM_PROVIDER=fake` y selección por
  pregunta de *fixture*; `l1d-169-synthetic-demo-seed`: paciente semilla (a).
- 🔗 `l1d-180-soporte-nli-descartadas` (US-064): produce `discardedOptions`; `l1d-179-citas-chunk-recuperado`
  (US-063): citas copiadas del corpus en idioma original.
- ↪ **change de L1D-194** (`l1d-194-aviso-ia-etiqueta-academica`, US-069) `[S1 resp. 18]`: crea
  `AiDisclaimer`, `AppHeader` y el *layout* `(dashboard)`; el panel **solo los compone**. Además, por
  contrato: los ejemplos clínicos nuevos de este change llevan el literal de B-06, que exige
  `assertDisclaimerRequired` de L1D-194; por eso **L1D-194 se mergea antes que este change**. Los E2E de
  L1D-194 sobre el panel (US-069 AC-1…AC-4) se **importan** a este change (tasks 3.4) y se implementan en
  su rama, con sus tags `[US-069 AC-n]`.
- ↪ `l1d-193-terminos-prohibidos-rn23` (US-068): `CAMPOS_COPIADOS_DEL_CORPUS` (allowlist de la marca
  `data-origen`), importado de `@oncolens/clinical-language`; **L1D-193 se mergea antes que este
  change**. Su recorrido Playwright de US-068 AC-3/AC-4 se **importa** a este change (tasks 3.1–3.3), con
  sus tags `[US-068 AC-n]`. Así no hay ciclo: 193 → 140 y 194 → 140.
- US-051 (`PatientContextCard`, S2), US-067 (`AnalysisBasisPanel`, S2) y US-062 (estados de espera y
  error completos, S3) llegan después; el panel no los requiere.

## Fuera de alcance

- Traducción de citas (Post-MVP, `[S1 resp. 8]`).
- Avisos por tarjeta (`warnings`: FR-11; US-101 en el S2, US-136 después): el campo se ignora en el S1
  aunque venga en la respuesta.
- Selección y texto de orden por aplicabilidad (US-125, US-126 AC-7), hasta 3 opciones (US-134), síntesis
  y tabla de aplicabilidad (S3–S5), selectores de fuentes y antigüedad (S3, S5).
- Base del análisis en la UI (US-067, S2), ficha y listado (US-051, US-048, S2), cierre de sesión (US-044).
- Estados completos de espera, sin evidencia y error con progreso y cancelación (US-062, S3); el aviso de
  IA y su literal (US-069 / L1D-194); el Route Handler y su verificación de `Origin` (US-060 / L1D-139).
- Cualquier control para aplicar, registrar o vincular una opción o una descartada a un tratamiento
  (US-070, S4, lo verifica como regresión).
