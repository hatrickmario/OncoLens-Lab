# Spike L1D-314 (US-257) · assistant-ui frente a shadcn · 2026-11-06

**Decisión: assistant-ui** (`@assistant-ui/react` 0.15.32, MIT) con `ExternalStoreRuntime`. AC-1…AC-4 cumplen y AC-5…AC-7 también. Peso medido: **≈ 145 KB gzip** de diferencia en la ruta del prototipo (no los ~267 KB de la documentación).

Prototipo: rama `spike/l1d-314-assistant-ui` (commit `32d44c24`), **cerrada sin merge**. Aquí solo entran este reporte, las capturas y la nota de ADR-51 §8.

## Cómo se midió

- Prototipo en `apps/web/app/(spike)/spike-chat` + `components/spike/*`, maquetado según `docs/ux/S6/variante-b.html` (hilo con tarjetas, panel lateral con `Dialog` de Radix, aviso RN-19 en cada turno, encabezado «Opciones descritas en la evidencia»).
- `next build` + `next start` (producción: el modo `dev` exige `unsafe-eval`, así que no vale para medir la CSP). Chromium de Playwright, solo `localhost`, sin Compose ni datos clínicos: el prototipo no llama a `clinical-api`.
- **CSP**: copia local de la CSP objetivo de US-216 en `proxy.ts` de la rama (L1D-266 aún no está mergeado): `script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'nonce-…'`, `style-src-attr 'unsafe-inline'` (aceptado en `[S6 resp. 19]`), `connect-src 'self'`, `frame-ancestors 'none'`. Sin `unsafe-eval` ni `unsafe-inline` en `script-src`.
- **Respuestas fijas**: copia local de la forma de `ConversationTurn` del glosario S6 §2 (`apps/web/lib/spike-fixtures.ts`), porque `contracts/examples/chat-turn-*.json` aún no existe (lo crea L1D-316). Al validar US-267 hay que repetir con los ejemplos reales.
- `esUrlHttpSegura()` **ya existe en `main`** (`apps/web/lib/evidence/procedencia.ts`; acepta `https:` y `http:` solo en `localhost`/`*.test`); se reutilizó sin copiarla.
- Spec: `e2e/spike-assistant-ui.spec.ts` (rama del spike), 6 tests, 6 en verde (2,5 s). Cada escenario comprueba, además, cero eventos `securitypolicyviolation`, cero errores de consola y que toda petición sea al origen de `web`.

## Resultado por escenario `[S6 resp. 2]`

| # | Escenario | Resultado | Evidencia |
|---|---|---|---|
| 1 | Resumen del caso con enlaces a los datos | **cumple** | 5 enlaces «◆ … Ver en el caso», contradicción de estadio con ambos valores, «Interpretación generada por IA», aviso RN-19. `capturas/escenario-1-caso-{1280,375}.png` |
| 2 | Faltantes con indicador y explicación desplegable | **cumple** | Los 4 indicadores (◌ ◐ ⚑ ◇) con texto, «¿Por qué importa?» con `<details>`. `capturas/escenario-2-faltantes-*.png` |
| 3 | Seguimiento sobre el análisis, mismo hilo | **cumple** | «↪ Preguntando sobre el turno 3», turno 4 «↪ Sobre el turno 3» + nota RN-24, el turno 3 sigue en el hilo. `capturas/escenario-3-seguimiento-*.png` |
| 4 | Síntesis, aplicabilidad, opciones, citas, limitaciones | **cumple** | Encabezado exacto, tabla con `caption`/`scope`, criterio de orden, relevancia como metadato, sin términos prescriptivos, aviso y «Uso académico/investigación». `capturas/escenario-4-evidencia-*.png` |
| 5 | Abrir fuente, expandir, consultar referencias sin perder el hilo | **cumple** | `Enter` sobre `[E1 · frag. 5]` abre y mueve el foco al fragmento con `scrollTop` idéntico; «Expandir todo» (`aria-pressed`); «Ver en el caso» abre el panel, `Esc` lo cierra y devuelve el foco al enlace. `capturas/escenario-5-*.png` |

## Resultado por AC de US-257

| AC | Resultado | Detalle |
|---|---|---|
| AC-1 cinco escenarios | cumple | Tabla anterior. |
| AC-2 CSP estricta | **cumple, con una condición** | 0 violaciones. Condición: el `Dialog` de Radix (ya en `main`) inyecta un `<style>` vía `react-style-singleton` y, con `style-src 'nonce-…'`, lo bloquea (`style-src-elem inline`). **No lo causa assistant-ui** (ningún `dist` suyo crea `<style>`). Se resolvió con `setNonce()` de `get-nonce` (dependencia transitiva) llamado desde un cliente que recibe el nonce de `x-nonce`. Hallazgo para L1D-266/L1D-325: los diálogos de la ficha tendrán el mismo fallo. |
| AC-3 solo APIs estables | cumple | Ver inventario. Ninguna `unstable_`/`@deprecated Experimental`. |
| AC-4 Markdown sin HTML crudo | cumple | `react-markdown` 10.1.0 + `rehype-sanitize` 6.0.0, sin `rehype-raw`, `urlTransform` con `esUrlHttpSegura()`. Con `<img onerror>`, `<script>` y `[x](javascript:…)`: 0 `img`, 0 `script`, 0 `[onerror]`, `window.__xss` indefinido, todos los `href` en `https:`; el enlace hostil queda como texto. |
| AC-5 red | cumple | Solo `POST /api/spike-chat` y assets del mismo origen (Playwright + DevTools). |
| AC-6 avisos RN-19 | cumple | En cada turno del asistente (1–4 y hostil). |
| AC-7 decisión y peso | cumple | Ver abajo y ADR-51 §8. |

## APIs de assistant-ui usadas (0.15.32) y su estado

| API | Estado |
|---|---|
| `useExternalStoreRuntime` (`messages`, `isRunning`, `onNew`, `convertMessage`) | estable |
| `AssistantRuntimeProvider` | estable |
| `ThreadPrimitive.Root` / `.Viewport` / `.Messages` (con función hija) | estable (la prop `components` de `Messages` está `@deprecated`: no se usa) |
| `MessagePrimitive.Root` / `.Parts` con `components.data.by_name` | estable |
| `ComposerPrimitive.Root` / `.Input` / `.Send` | estable |
| `runtime.thread.append(...)` | estable |
| Tipos `AppendMessage`, `ThreadMessageLike` | estables |

**Evitar** (experimentales en 0.15.32): `threadId`, `onSwitchToNewThread`, `onSwitchToThread` (relevantes para «Nueva conversación»), `unstable_*`, `useLocalRuntime` no se probó.

## Peso gzip (AC-7)

Medido sobre los chunks JS que carga cada ruta de la build de producción (gzip -9):

| Ruta | gzip | sin comprimir |
|---|---|---|
| `/login` (referencia de la app) | 216,7 KB | 713 KB |
| `/spike-base` (misma tarjeta de turno + Markdown, **sin** assistant-ui ni Dialog) | 219,0 KB | 713 KB |
| `/spike-chat` (assistant-ui + Radix Dialog) | 363,9 KB | 1 211 KB |

**Diferencia ≈ 145 KB gzip** (incluye ~11 chunks frente a 9 y el `Dialog`, que la app ya usa en otras rutas). Es el techo del coste de adoptarlo; el panel solo cargaría esto en la ruta del chat.

## `npm audit`

`npm audit --omit=dev` tras instalar `@assistant-ui/react@0.15.32`, `react-markdown` y `rehype-sanitize`: **0 vulnerabilidades**. La licencia de `@assistant-ui/react` y `@assistant-ui/core` es MIT. Al adoptarlo en `main` (L1D-324) hay que repetir la auditoría y justificar las tres dependencias en su `design.md`.

## Hallazgos para L1D-324 / L1D-325 / ADR-51

1. **`components.data.by_name` debe ser estable.** Con una función en línea dentro del render, assistant-ui remonta la parte y se pierde el estado local de la tarjeta (expandir/plegar). Definir el componente a nivel de módulo y pasar las acciones por contexto.
2. **Autoscroll por defecto** deja la vista al final de un turno largo (se ve en `escenario-4-evidencia-1280.png`). Para turnos de evidencia, usar `ThreadPrimitive.Viewport` con `turnAnchor="top"` o `autoScroll={false}`.
3. **Diálogo y CSP** (AC-2): el `Dialog` de Radix necesita el nonce de estilos; resolverlo una vez en L1D-266 (o evitar `react-remove-scroll` con un panel no modal que mantenga foco atrapado a mano).
4. El botón «Expandir todo» no debe cambiar de nombre accesible; usar `aria-pressed` (lo hace el prototipo).
5. Consola de Chrome: un aviso de `issue` por el `<textarea>` del compositor sin `id`/`name`; dar `name` al `ComposerPrimitive.Input`.
6. El mapa de componentes sugerido para L1D-324: `TurnoAsistente` (organismo) → `BloqueVista`, `FaltanteVista`, `EvidenciaVista`, `ChipCita`, `Fragmento` (moléculas), reutilizando `AiDisclaimer`, `CitationChip`/`CitationDetails` y `ApplicabilityTable` del panel actual; el texto de los avisos sale de `turn.notices[]` (glosario §3).

## Visual-check

Veredicto: **PASS** (con la salvedad de alcance).
Stack: `next start` local del prototipo (sin Compose: el spike no usa backend) · fixtures sintéticos · `http://localhost:3100`.

| Paso | Resultado |
|---|---|
| Estados | Los 5 escenarios y el Markdown hostil renderizados; estados de error/sin evidencia/opt-out **no** cubiertos (son del panel definitivo, L1D-324). |
| Teclado | Citas, «Ver en el caso», diálogo (`Esc`, retorno de foco) y compositor operables solo con teclado. |
| Consola | 0 errores y 0 violaciones CSP (Playwright MCP y DevTools); 1 `issue` informativo del textarea sin `id`. |
| Red | Solo `POST /api/spike-chat` y assets del mismo origen; sin identidad en URLs. |
| Rendimiento | Traza DevTools de `/spike-chat`: LCP 56 ms, CLS 0,00 (laboratorio local). |
| Capturas | 375 y 1280 px por escenario en `capturas/`. |

Fallos convertidos en tests: ninguno (spike exento). Durante el desarrollo aparecieron y se corrigieron en el prototipo: el remonte por `by_name` en línea, la violación de CSP del `Dialog` y un nombre accesible cambiante.

## Cierre

La rama `spike/l1d-314-assistant-ui` se cierra sin merge ni PR. La dependencia no entra en `apps/web/package.json` de `main`; la añade L1D-324 con su auditoría.
