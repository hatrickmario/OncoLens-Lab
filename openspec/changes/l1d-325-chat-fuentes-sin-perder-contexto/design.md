# Design — l1d-325-chat-fuentes-sin-perder-contexto

## Context

- US-267 (`l1d-324`) monta el panel conversacional en la página del paciente: un componente padre `'use client'` con
  el estado de la conversación (turnos, borrador de la pregunta, turno en curso) y una tarjeta por turno (variante B).
- Referencia visual: `docs/ux/S6/variante-b.html` y `docs/ux/S6/pantallas-s6.md` §1 «Escenario 5», §2 «Variante B»,
  §4 y §6 `[S6 resp. 16]`: el chip ◆ despliega su procedencia y «Ver en el caso»; «Ver en el caso» y la cita
  `[E1 · frag. n]` abren un **panel lateral** (`Sheet`: `<dialog>` modal, foco atrapado, `Esc`, retorno del foco) sin
  mover el hilo; «Expandir todo / Plegar todo» por turno con `aria-pressed`; a 375 px el panel ocupa la pantalla.
  Sin desviaciones respecto de la maqueta.
- Ya existen en `apps/web`: `components/ui/dialog.tsx` (Radix Dialog 1.3.1 con `retornoDeFoco`),
  `molecules/citation-details.tsx` + `cited-fragment.tsx` (metadatos de `CitedSource` con «No disponible»),
  `lib/evidence/procedencia.ts` con `esUrlHttpSegura()`, `molecules/procedencia-del-dato.tsx`, `origen-del-dato.tsx`,
  `historico-del-dato.tsx`, `organisms/applicability-table.tsx`, y los Route Handlers
  `app/api/patients/[id]/case` y `…/{biomarkers|clinical-attributes|prior-treatments|clinical-notes}/[id]/history`.
- La tecnología del hilo (assistant-ui o shadcn) la fija `l1d-314` en ADR-51 §8; este change no depende de cuál gane:
  los paneles viven fuera de las primitivas del hilo, como hermanos del componente padre.

## Goals / Non-Goals

**Goals:** abrir cita, dato, bloques y referencias sobre la conversación sin desmontarla (AC-1…AC-5).

**Non-Goals:** visor de PDF o descarga (Post-MVP, `case-timeline` «Origen visible sin enlace de descarga»);
«Preguntar sobre este turno» y «Copiar referencias» (US-265/US-267); endpoints nuevos.

## Decisions

1. **Un solo `Sheet` por panel conversacional, controlado por el padre** con un estado
   `panelLateral: null | { tipo: 'cita', turnId, chunkId } | { tipo: 'dato', turnId, dataLink: ConversationDataLink }` y la ref del
   disparador. Abrirlo no cambia `turnos` ni `borrador`, así que el hilo no se re-renderiza ni pierde *scroll*; Radix
   devuelve el foco con `retornoDeFoco` (patrón ya probado en `dialog.tsx`). Descartadas: ruta paralela/interceptada de
   Next (`@modal`) — cambia la URL y remonta el segmento, rompe AC-2 — y un `Sheet` por turno (N portales, foco
   ambiguo). Revertir es barato (UI), así que no se exploran tres alternativas.
2. **El dato del `Sheet` se lee bajo demanda** por los Route Handlers existentes: `GET /api/patients/{id}/case` para
   el valor, origen y procedencia, y `GET …/{recurso}/{id}/history` solo si el `resourceType` tiene histórico
   (biomarcador, atributo, tratamiento previo, nota). Un diagnóstico muestra origen y procedencia sin histórico. El
   contrato no trae `historyPath` (glosario §2): la ruta la deriva la función pura
   `rutaDeHistorico(resourceType, resourceId)` desde el `ConversationDataLink`, siempre sobre los Route Handlers
   `/api/*` del mismo origen: devuelve el tramo bajo el paciente (p. ej. `biomarker` + id →
   `biomarkers/{resourceId}/history`; `diagnosis` → `null`) y el panel lo une a `/api/patients/{patientId}/` con el
   `patientId` de la ruta de la página. Con su unitario. El `resourceId` es un UUID (se codifica con
   `encodeURIComponent`); un `resourceType` desconocido devuelve `null` (sin petición).
3. **Plegado por turno con estado local de la tarjeta** (`expandido`), `React.memo` en la tarjeta y claves estables
   por `turn.id`: plegar un turno no re-renderiza los demás (AC-3). El aviso de omitidas usa el plural del catálogo de
   mensajes: «{n} afirmaciones omitidas por falta de soporte» / «1 afirmación omitida…»; con `omittedClaims = 0` no se
   muestra.
4. **«Ver referencias» reutiliza `citation-details.tsx`** (una sola fuente de metadatos y de «No disponible»,
   RN-25) dentro de un `<details>` del turno; la regla de enlace es la de L1D-266 («Enlaces de cita solo con
   esquemas seguros», `esUrlHttpSegura()`, SEG-12), reutilizada y no redefinida aquí, sin una
   segunda comprobación local.
5. **Texto del corpus y del dato como texto React**, nunca HTML crudo ni `dangerouslySetInnerHTML`. Si algún texto se
   pinta como Markdown (p. ej. reutilizando el renderizador de bloques de L1D-324), sin `rehype-raw`, con
   `rehype-sanitize` y `urlTransform` que devuelve `''` si `esUrlHttpSegura()` es falso (glosario §3; L1D-266 D6). Un
   escenario con `<img onerror>` en el `chunkTextSnapshot` lo fija.

## Privacidad y ownership

- Datos que cruzan: navegador → `web` (`/api/patients/{id}/case`, `…/history`) → `clinical-api`. Nada nuevo hacia
  `rag-orchestrator`; el panel no lo conoce. `rag-orchestrator` no toca datos clínicos ni `clinical-minio`.
- El `Sheet` muestra el dato clínico del paciente con su origen a un `doctor` autenticado (RBAC existente de los
  Route Handlers); el `sourceDocumentId` no se usa para armar URLs (Post-MVP). Sin PII en URLs: el `Sheet` no cambia
  la URL ni la query.
- La identidad nunca entra al `Sheet` (no se lee de `identity`); el texto del fragmento es corpus público.
- **Seguridad web:** sin Zod nuevo (solo lecturas con los schemas generados ya compartidos); sin variables
  `NEXT_PUBLIC_` nuevas; componentes cliente sin módulos `server-only`; texto del LLM y del corpus como texto React sin
  HTML crudo (o Markdown sin `rehype-raw`, con `rehype-sanitize` y `urlTransform` vía `esUrlHttpSegura()`); enlaces
  según el requisito de L1D-266 «Enlaces de cita solo con esquemas seguros» (SEG-12), sin regla propia; CSP sin impacto (Radix no inyecta scripts inline; se
  verifica en `visual-check` con la CSP de US-216); sin dependencias nuevas (`@radix-ui/react-dialog` ya presente,
  `npm audit` sin cambios).

## Contratos

Sin cambios de `openapi.yaml` ni de `contracts/examples/`. `web` es **consumidor** de: `ConversationDataLink` (sin `historyPath`) y `omittedClaims`
del turno (proveedor `clinical-api`, definidos por `l1d-315`/`l1d-317`), `CitedSource` (existe) y las lecturas
`GET …/case` y `…/history` (existen). Los tests MSW se construyen desde `contracts/examples/chat-turn-*.json` y los
ejemplos existentes de la vista de caso y del histórico. Sin cambio incompatible (oasdiff no aplica); ADR-26 intacto.

## Componentes y patrones

- **Nuevo** `components/ui/sheet.tsx`: variante lateral de `dialog.tsx` (mismo `retornoDeFoco`); ancho completo bajo
  480 px.
- **Nuevos** `organisms/panel-lateral-del-chat.tsx` (decide contenido por `tipo`), `molecules/fragmento-citado-en-panel.tsx`
  (fragmento + `citation-details`), `molecules/dato-del-paciente-en-panel.tsx` (valor, `procedencia-del-dato`,
  `historico-del-dato`), `molecules/referencias-del-turno.tsx`, `molecules/aviso-de-afirmaciones-omitidas.tsx`.
  Cada uno < 100 líneas.
- **Modificados** (de `l1d-324-panel-conversacional`): `ConversationTurnCard` (botón «Expandir todo», «Ver referencias», citas y chips ◆ como
  disparadores) y el padre del panel (estado `panelLateral`).
- **Patrón:** ningún provider ni contexto nuevo — el disparador recibe un callback `alAbrirPanel` del padre a 2
  niveles (tarjeta → chip); sin evidencia de *prop drilling* ≥ 3 niveles, no hay contexto (YAGNI). RSC: la página del
  paciente sigue siendo RSC; el `'use client'` es el del panel de US-267.

## Dependencias y colaboradores

- `rutaDeHistorico(resourceType, resourceId)` en `lib/caso/` (regla pura sobre `/api/*`, unitario).
- `esUrlHttpSegura()` y `citation-details.tsx`: reutilizados, no duplicados (una regla, un dueño).
- Los textos («Ver en el caso», «Ver referencias», «Expandir todo», «Plegar todo», «Abrir la vista de caso completa
  (abre en nueva pestaña)», aviso de omitidas) en `lib/mensajes.ts`, pasan la lista de términos prohibidos (RN-23).
- Fakes tocados: ninguno de puertos; MSW sobre `/api/*` desde los ejemplos del contrato.

## Risks / Trade-offs

- [assistant-ui remonta mensajes al cambiar el *store*] → el `Sheet` y su estado viven fuera del `Thread`; AC-1 lo
  comprueba con *scroll* y borrador en Playwright.
- [`l1d-324-panel-conversacional` cambia el nombre del padre o de `ConversationTurnCard`] → los nombres de este design se ajustan al rebasar; los
  escenarios no dependen de ellos.
- [La vista de caso es grande para abrir un dato] → se lee una vez por apertura sin caché (requisito vigente «Vista de
  caso sin caché»); aceptable con el seed sintético.

## Ajustes de la implementación

- **Estado del panel resuelto, no por ids.** `panelLateral` guarda el fragmento ya armado (`FragmentoAbierto`: texto, título, ordinal y la fuente con metadatos si el turno la trae) o el `ConversationDataLink` con los textos del turno que lo citan; el foco vuelve al botón por su `id` (`idDisparador`). Las citas de un bloque (`ChatCitation`) no traen metadatos de fuente: se unen por `chunkId` con las `citedSources` del análisis del mismo turno y, sin coincidencia, el panel dice «Metadatos de la fuente: No disponible» (RN-25).
- **Valor del dato.** `CaseView` no trae `id` en los puntos de `biomarkerSeries` ni el diagnóstico (tarea 3.1): `datoDelCaso` solo localiza tratamientos previos, atributos y eventos de la línea de tiempo; para biomarcador y diagnóstico el panel muestra el origen del enlace y el texto del bloque que cita el dato («En la respuesta», Markdown seguro). El histórico sí se lee por `…/{id}/history` vía `rutaDeHistorico`, y solo después de que la vista de caso cargó.
- **Contexto acotado a un turno (`ExpansionDelTurno`).** Evidencia del patrón: «Expandir todo» lo fija la tarjeta y lo lee `ApplicabilityTable`, a cuatro niveles (`AnalysisResult` → lista → opción → tabla), por encima del umbral de *prop drilling* (≥ 3). Valor por defecto `false`: fuera de un turno la tabla se pliega como siempre.
- **Disparadores como botones.** Los chips ◆ pasan de enlace (`<a target="_blank">`) a `<button aria-haspopup="dialog">`, y las citas `[E1 · frag. n]` de los bloques, de `<details>` a botón (`conversacion.citaEtiqueta`, como la maqueta); «Abrir la vista de caso completa» es el único enlace a otra pestaña.
- **Referencias.** «Ver referencias» lista las `citedSources` de las opciones del análisis (sin repetir) y monta la lista al abrirla, para no duplicar en el DOM los metadatos de la tarjeta.
- **Contrato y XSS.** `zEvidenceAnalysis` ya rechaza un `sourceUrl` no `https`, así que un turno con `javascript:` ni llega a pintarse; la regla de `esUrlHttpSegura()` de los componentes es la segunda defensa y se prueba a nivel de componente. El texto del fragmento va como texto React (`<blockquote>`), nunca como HTML.
- **Sin dependencias nuevas** (`@radix-ui/react-dialog`, `react-markdown` y `rehype-sanitize` ya estaban); sin importar JSON nuevos del catálogo (la lista de `COPY` del `Dockerfile` de `web` no cambia).
- **Tests de L1D-324 y ARR-07 que cambian de superficie** (sin aflojar aserciones): el enlace «Ver en el caso» pasa a botón; `[E1]` a `[E1 · frag. n]`; el `aside` «Fragmento citado» a `dialog` con el mismo nombre y botón «Cerrar» en el encabezado (el orden «enlace antes de Volver» pasa a «enlace después del texto del fragmento»).
