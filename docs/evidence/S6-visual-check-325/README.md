# visual-check · L1D-325 (fuentes y datos sin perder la conversación) · 2026-11-07

## visual-check · l1d-325-chat-fuentes-sin-perder-contexto · 2026-11-07
Veredicto: PASS con 2 observaciones (ningún fallo; ninguna requiere test en rojo)
Stack: Compose local (proyecto `oncolens-visual325`) · seed sintético · `LLM_PROVIDER=fake` / `MODEL_PROVIDER=fake` · `ENABLED_CANCER_TYPES=mama` · web `http://127.0.0.1:3000` · rama `feat/l1d-325-chat-fuentes-sin-perder-contexto` HEAD 76c9299c. Se levantó con los mismos pasos que `scripts/e2e/ejecutar.sh` (secretos, migraciones, seed, `up`) pero con proyecto propio y el stack conservado.
Herramientas: Playwright MCP (`browser_run_code_unsafe`: consola, red, a11y, teclado, capturas). **El MCP de Chrome DevTools no conectó** en esta sesión: consola y red salen de los listeners de Playwright, el rendimiento de `PerformanceObserver` y axe-core se inyectó con `addInitScript` (la CSP no se relaja). No hay traza de DevTools.
Pacientes: semilla (a) `0fd028e2-…` y P-CHAT `71ca1471-…` (dato HER2 3+ con 2+ reemplazado), sesión `doc1@test.local` (sintético). `127.0.0.1`, no `localhost` (403 por `Origin`, esperado).

### Estados
| Paso | Resultado | Evidencia |
|---|---|---|
| (1) Cita `[E1 · frag. 1]` abre el panel | OK | `dialog` «Fragmento citado» con el texto del fragmento y metadatos del corpus (NCI PDQ, diseño, versión, fechas, idioma, licencia, «No disponible» donde falta, fuente original https); URL sin cambios; `02-panel-cita-1280.png` |
| (1) Esc y «Cerrar» | OK | con el hilo de 3 turnos, scroll medido con la cita a la vista (2063 antes = durante = después), borrador de la caja intacto, URL igual, 3 tarjetas, foco de vuelta en la cita |
| (1) Foco tras cerrar | OK, con matiz | el foco vuelve a la cita de forma asíncrona (Radix `onCloseAutoFocus`): en 1 de 4 cierres consecutivos aún no estaba en la cita justo tras `detached` y sí a los 400 ms. No es un fallo (los E2E usan `toBeFocused` con espera); ver observación 2 |
| (2) Turno de caso (P-CHAT), «◆ Biomarcador · 2026-04-24 — Ver en el caso» | OK | panel «Dato del paciente»: «Biomarcador · 24/04/2026», «Origen: Carga inicial», «En la respuesta…» con «HER2: 3+ (IHQ)…»; URL igual, 1 turno montado, borrador conservado, foco vuelve al disparador; `04-panel-dato-1280.png`. El diagnóstico muestra «Origen: Registro manual» y su texto, sin histórico |
| (2) Histórico del 2+ reemplazado | no verificado en vivo | la única apertura del biomarcador HER2 se hizo con el 503 simulado en `…/history` (el histórico fallido no se reintenta, observación 1) y el stack se bajó antes de repetirla sin interceptar; no se vio el `2+` reemplazado en vivo. Lo cubre el E2E `[US-268 AC-2]` del propio change, no se ejecutó aquí |
| (3) «Expandir todo» / «Plegar todo» | OK | turno de 3 opciones: las 3 «Ver aplicabilidad por criterio» pasan a `aria-expanded=true` y vuelven a `false`; el turno de 1 opción (otra tarjeta) no cambia; 25 estados Coincide/Parcial/Desconocido/No coincide como texto; `07-expandir-todo-1280.png`. Aviso de omitidas: «Afirmaciones omitidas: 0» (el aviso con omitidas > 0 no se puede servir con el LLM fingido) |
| (4) «Ver referencias» | OK | lista «Referencias del turno» con 3 referencias; metadatos del corpus y «No disponible» (RN-25); 3 enlaces `target="_blank" rel="noopener noreferrer"`; `08-referencias-1280.png` |
| (5) URL insegura (`javascript:`, `ftp:`) | cubierto por contrato y tests de componente | se interceptó el `POST …/turns` y se reescribió la URL de la fuente: el cliente rechaza la **respuesta completa** (validación Zod del contrato exige https) y muestra «No se pudo completar la respuesta» + «Reintentar». La URL insegura nunca llega a un `<a>`; `window.__xss` → `undefined`. Con la rama de `EnlaceFuenteOriginal` (`esUrlHttpSegura`) no alcanzable por esta vía, queda cubierta por los tests de componente |
| (6) 503 | OK en el dato; ver observación 1 en el histórico | 503 en `GET /api/patients/{id}/case`: `role=alert` «No se pudo cargar el dato» + «Reintentar»; al reintentar (2.ª petición) carga el dato; hilo y borrador intactos; `06-dato-503-reintentar-1280.png`. 503 en `…/biomarkers/{id}/history`: el panel muestra el dato y «No se pudo cargar el histórico.» **sin** botón «Reintentar»; `05-historico-503-1280.png` |

### Red
- 172 peticiones, **todas a `http://127.0.0.1:3000`**; ninguna a clinical-api, rag-orchestrator, MinIO, Milvus ni terceros.
- `/api/*` usadas: `POST /api/auth/login`, `POST /api/patients/<id>/conversations`, `POST /api/conversations/<id>/turns`, `GET /api/patients/<id>/case`, `GET /api/patients/<id>/biomarkers/<id>/history`. Sin query strings con datos; solo UUID opacos; la pregunta va en el cuerpo del POST.
- Mutaciones con `Origin: http://127.0.0.1:3000` (en las primeras, el listener de Playwright con `headers()` no expone `Origin`; el BFF las aceptó todas, y exige el `Origin`).
- Cookie `oncolens_session`: HttpOnly, `SameSite=Strict`, Secure.
- Cabeceras (`/login`): CSP con nonce y `strict-dynamic`, `style-src-attr 'unsafe-inline'`, `connect-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`; `X-Frame-Options: DENY`; `nosniff`; `Referrer-Policy: no-referrer`.

### Consola
0 errores propios, 0 advertencias, 0 violaciones de CSP, 0 errores de hidratación, `pageerror` vacío. Los 2 únicos mensajes son `Failed to load resource … 503` por las respuestas que se inyectaron para el paso (6).

### Accesibilidad y teclado
- axe-core (wcag2a/aa/21a/21aa): **0 violaciones** (ni serious/critical ni menores) con el panel de cita abierto, el panel de dato abierto, a 1280 y 375 px, con «Expandir todo» y con las referencias abiertas.
- Trap de foco del panel (cita y dato): Tab alterna solo entre los controles del diálogo (enlace de la fuente / «Abrir la vista de caso completa» y «Cerrar»), 6 pulsaciones sin salir; el foco entra al panel al abrir; Esc cierra.
- Estados de aplicabilidad por texto, no solo color. Enlace «Abrir la vista de caso completa»: `/pacientes/<id>/caso`, `target=_blank`, `rel="noopener noreferrer"`.

### Tokens
`--color-clinical: #0e5a5f`, `--color-evidence: #1f4fb8`, `--color-control-border: #7c8696`, `--color-surface: #fff` presentes en `:root`.

### Rendimiento (laboratorio local, alerta no FAIL)
Carga de `/pacientes/<id>/analisis`: TTFB 15 ms, DCL 34 ms, LCP 348 ms, CLS 0, 0 tareas largas. Sin traza de DevTools.

### Capturas
`01-antes-1280`, `02-panel-cita-1280`, `03-vista-1280`, `04-panel-dato-1280`, `05-historico-503-1280`, `06-dato-503-reintentar-1280`, `07-expandir-todo-1280`, `08-referencias-1280`, `10-hilo-375`, `11-panel-dato-375` (PNG en este directorio). Sin scroll horizontal: 375 px → `scrollWidth 360 = clientWidth 360` sin panel y `375 = 375` con el panel abierto; 1280 px → `1280 = 1280`.

### Observaciones (no fallos)
1. **Histórico sin «Reintentar».** Con 503 en `…/history` el panel dice «No se pudo cargar el histórico.» sin reintento. Causa probable: `apps/web/components/molecules/historico-del-dato.tsx:66` (`if (estado.tipo === 'error') return <p>…`) y `historico-en-panel.tsx` (un único `useEffect`, sin acción de recarga). El spec (`specs/evidence-panel/spec.md`) solo exige «Reintentar» para el fallo del dato (`/case`), que sí funciona; el encargo pedía también el histórico. Si se quiere, es una mejora del change o deuda.
2. **Foco de retorno asíncrono** (ver arriba): llega al disparador en ≤ 400 ms; no se mide mejor sin DevTools.
3. A 375 px el panel mide 376 px de ancho desde x = -1 (borde de 1 px fuera del viewport); no genera scroll horizontal.
4. No se contrastó contra `docs/ux/S6/` (variantes A/B/C): este loop verificó estados, textos y tokens del change.

Fallos convertidos en tests: ninguno (no hubo fallos).
