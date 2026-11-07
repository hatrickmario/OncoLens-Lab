# visual-check · L1D-324 (panel conversacional) · 2026-11-07

## visual-check · l1d-324-panel-conversacional · 2026-11-07
Veredicto: PASS
Stack: Compose local (proyecto `oncolens-visual324`) · seed sintético · `LLM_PROVIDER=fake` / `MODEL_PROVIDER=fake` · `ENABLED_CANCER_TYPES=mama` · web `http://127.0.0.1:3000` · base `origin/main` 0bbcacf3.
Herramientas: Playwright MCP (consola, red, accesibilidad, teclado, capturas). **El MCP de Chrome DevTools no conectó** en esta sesión: consola y red se tomaron con los listeners de Playwright (`page.on('console'|'pageerror'|'request'|'response')`), el rendimiento con `PerformanceObserver` (LCP, CLS, long tasks) y axe-core inyectado con `addInitScript` (la CSP no se relaja). No hay traza de rendimiento de DevTools.
Paciente: semilla (a) `0fd028e2-…`, sesión `doc1@test.local` (sintético). Se usó `127.0.0.1`, no `localhost`: con `localhost` el login devuelve 403 por `Origin` (la lista de orígenes del stack es 127.0.0.1; es el comportamiento esperado de US-216, no un fallo).

### Estados
| Estado | Resultado | Evidencia |
|---|---|---|
| Vacío con preguntas guiadas | OK | 4 botones «Preguntas de partida sobre este caso»; `Preguntar` deshabilitado sin texto; `01-vacio-1280.png` |
| Enviando («Analizando…») | OK | `<p role=status>Analizando…`; eco «Pregunta del oncólogo» en `role=log aria-live=polite`; solo progreso, sin contenido del asistente; `02-enviando-1280.png` |
| Turno de caso | OK | chip «◆ Caso», bloques «◆ Información clínica del paciente», enlaces «◆ … Ver en el caso (se abre en otra pestaña)» a `/pacientes/<id>#diagnostico` y `#biomarcadores`, «Datos usados / Ausentes», región «Avisos de la respuesta» con RN-19 + «Uso académico/investigación» |
| Turno de faltantes («¿Qué información falta?») | OK | chip «◌ Faltantes», 4 faltantes como avisos (no bloquean; el campo sigue habilitado, RN-26), avisos RN-19 |
| Turno de evidencia (query literal HER2 IIA) | OK | chip «▤ Evidencia», «Opciones descritas en la evidencia», criterio de orden por aplicabilidad (RN-28), «Opción descrita 1 de 1», conteo Coincide/Parcial, cita `[E1]` bajo «▤ Evidencia científica (corpus)»; `03`, `09` |
| Sin evidencia («¿Qué hay publicado sobre este caso?») | OK | «Ningún fragmento del corpus superó el umbral de relevancia. No se generaron opciones.», «Relevancia máxima: no aplica» (null, no 0), Base del análisis, fuentes no incluidas NCCN/ESMO |
| Error + «Reintentar» (POST turnos interceptado con 503) | OK | `role=alert` «No se pudo completar la respuesta» + botón «Reintentar»; el campo sigue habilitado; al reintentar → 201 y el turno aparece, el error desaparece; `05-error-reintentar-1280.png` |
| Opt-out (403 `OPT_OUT_ANALISIS_IA`) | OK | `role=status` «Este paciente no tiene habilitado el análisis con IA; el resto de la ficha sigue disponible.»; sin «Reintentar»; campo deshabilitado; `07-optout-1280.png` |
| «Nueva conversación» | OK | de 5 turnos a 0 tarjetas, vuelven las 4 preguntas guiadas; la conversación se crea al preguntar; `06-nueva-conversacion-1280.png` |
| Lenguaje | OK | regex de `recomendad|recomendaci|debe recibir|tratamiento indicado` sobre `main` con 4 turnos: sin coincidencias |

### Red
- Peticiones del recorrido: 22 (carga + 4 turnos + errores simulados). **Todas al origen de web**; ninguna a clinical-api, rag-orchestrator, MinIO, Milvus ni terceros.
- Mutaciones: `POST /api/patients/<id>/conversations` y `POST /api/conversations/<id>/turns` (todas 201 salvo las simuladas). `Origin: http://127.0.0.1:3000` en todas (leído con `allHeaders()`).
- Ni la pregunta (ninguna de las 3 literales ni las guiadas) ni identidad del paciente aparecen en URLs o query strings: solo IDs opacos (UUID del paciente y de la conversación). La pregunta viaja en el cuerpo del POST.
- Cabeceras (curl `/login`): CSP con nonce y `strict-dynamic`, `style-src 'self' 'nonce-…'`, `style-src-attr 'unsafe-inline'`, `connect-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`; `X-Frame-Options: DENY`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer`.

### Consola
- Recorrido feliz (carga, 4 turnos, teclado, redimensionado): **0 errores, 0 advertencias, 0 violaciones de CSP, 0 errores de hidratación**; `pageerror` vacío; ningún `<script>` sin nonce.
- Los únicos mensajes de consola son `Failed to load resource … 503` y `… 403`, que el propio navegador emite por las respuestas que **yo inyecté** (interceptación) para los estados de error y opt-out; esperados y no cuentan.

### Accesibilidad y teclado
- axe-core (wcag2a/aa/21a/21aa): **0 violaciones (ningún serious/critical, ni minor/moderate)** en vacío, con 3 turnos a 1280 px y a 375 px.
- Tab: Cerrar sesión → Nueva conversación → 4 preguntas guiadas → campo; foco visible (outline sólido 3 px) en todos. Con texto escrito, Tab lleva a «Preguntar». Enter en una pregunta guiada la envía; Enter en el campo envía (turno 4 en E2E y aquí); Enter sobre «Preguntar» envía y el foco avanza en orden.
- Estados distinguibles por texto y glifo (◆ ◌ ▤, «Coincide»/«Parcial»), no solo color. Regiones: `role=log` (`aria-live=polite`), `role=status` (progreso, opt-out), `role=alert` (error).

### Tokens
- `--color-clinical: #0e5a5f` y `--color-evidence: #1f4fb8` presentes en `:root`; usados en `main`: texto/borde/fondo clinical (`rgb(14,90,95)` en 22 propiedades, fondo `#e1f1f1` en 6) y evidence (`rgb(31,79,184)` en 8, fondo `#e8eefa` en 1) con 4 turnos.

### Rendimiento (laboratorio local, alerta no FAIL)
- Carga de `/pacientes/<id>/analisis`: TTFB 17 ms, DCL 51 ms, load 60 ms, LCP 72 ms, CLS 0, 0 tareas largas (> 50 ms). Sin traza de DevTools (ver arriba).

### Capturas
`01-vacio-1280`, `02-enviando-1280`, `03-cuatro-turnos-1280`, `04-cuatro-turnos-375`, `05-error-reintentar-1280`, `06-nueva-conversacion-1280`, `07-optout-1280`, `08-tres-turnos-375`, `09-tres-turnos-1280` (PNG en este directorio). Sin scroll horizontal: 375 px → `scrollWidth 360 = clientWidth 360` (menos barra vertical), 0 elementos de `main` por fuera del viewport; 1280 px → `1265 = 1265`.

### Observaciones (no fallos)
1. El hilo (`role=log`) vive en un contenedor con `max-h-[60vh] overflow-y-auto`, desplazado al último turno. Las capturas `fullPage` solo muestran la parte visible del contenedor (arriba se ve cortado el turno anterior); la geometría se comprobó: el botón «Nueva conversación» termina exactamente donde empieza el contenedor (244 px a 375, 228 px a 1280), sin solape.
2. No se contrastó la pantalla contra `docs/ux/S6/` (`pantallas-s6.md`, variantes A/B/C): este loop verificó los estados, textos de `messages/es.json` y tokens del change, no desviaciones de diseño; pendiente si el Gate 2 las exige.

Fallos convertidos en tests: ninguno (no hubo fallos).
