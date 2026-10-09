---
name: visual-check
description: Loop visual de OncoLens — frontend-dev comprueba su propio output en un navegador real (Playwright MCP + Chrome DevTools MCP) contra el Compose local con seed sintético, sin que el humano abra el navegador. Recorre los estados de la UI, consola (CSP, hidratación), red (solo /api/* del mismo origen, sin PII en URLs), accesibilidad, teclado, rendimiento y capturas a 375 y 1280 px. Úsala tras el verde de los AC y antes del refactor en changes que tocan la UI de apps/web. Es evidencia para el Gate 2, no sustituye a los tests E2E.
argument-hint: "<change> [ruta ...]"
---

# Loop visual: el agente mira lo que construyó

**Qué es:** una verificación exploratoria del implementador en un navegador real. **Qué no es:**
el gate. El gate son los tests (Vitest, Playwright E2E en la CI). Si el loop encuentra un fallo,
primero se escribe el test que lo reproduce (rojo) y después se corrige: el hallazgo acaba
siempre en un test, nunca solo en el reporte.

Herramientas (solo en `frontend-dev`, declaradas en su frontmatter):
- **Playwright MCP** (`mcp__playwright__*`): navegar, interactuar y leer el **árbol de
  accesibilidad** (`browser_snapshot`), redimensionar y capturar. Úsalo para recorrer los flujos.
- **Chrome DevTools MCP** (`mcp__chrome-devtools__*`): consola, red y **trazas de rendimiento**.
  Arranca con `--no-performance-crux --no-usage-statistics`: sin eso enviaría las URLs de las
  trazas y estadísticas a Google.

## 0. Precondiciones (si una falla, detente y repórtalo; no la sortees)

1. **Solo stack local con seed sintético.** El hook `guard-visual-loop.sh` bloquea cualquier URL
   fuera de `localhost`/`127.0.0.1` y cualquier entorno con `REAL_*_ENABLED`. No intentes
   esquivarlo: todo lo que ve el navegador entra a tu contexto, y tu modelo corre en la nube
   (RN-12, RN-14).
2. **Un loop a la vez.** Los worktrees comparten los puertos del Compose. Toma el candado común
   a todos los worktrees y suéltalo al terminar, también si fallas:
   `LOCK="$(git rev-parse --git-common-dir)/oncolens-visual-check.lock"; mkdir "$LOCK"`.
   Si ya existe, espera y reintenta (o devuelve "visual-check: en cola" al orquestador); si su
   dueño ya no corre, el orquestador lo libera.
3. **Stack arriba desde tu worktree:** Compose (`infra/docker/`) con el seed sintético y `web`
   respondiendo en `http://localhost:<puerto de web>`. Antes de que existan la infra y el seed
   (Pre-S1/S1), di "visual-check: pendiente, sin stack" y continúa sin inventar evidencia.
4. **Sesión de prueba** con el usuario sintético del seed (nunca credenciales reales ni de otra
   máquina).

## 1. Recorrido por estado (Playwright MCP)

Para cada ruta que toca el change, recorre **todos** los estados que define su design.md y, como
mínimo, los que apliquen: cargando, vacío, error, **sin evidencia** (`topRelevanceScore: null`),
avisos no bloqueantes (faltantes, no verificado, conflicto, **desactualizado**, RN-26) y opt-out
(`403`). En cada uno, con `browser_snapshot` (no captura):
- textos obligatorios presentes (RN-19 aviso de IA, encabezado "Opciones descritas en la
  evidencia", RN-23) y ningún término prescriptivo;
- criterio de orden por aplicabilidad visible (RN-28) y citas con enlace (RN-01);
- los avisos permiten continuar (RN-26).

**Contra el diseño de referencia** (`docs/ux/`): estructura, jerarquía, textos, estados y tokens
coinciden con la pantalla elegida en la fase 3; cada desviación se reporta (no se "arregla" el
diseño desde el código).

## 2. Accesibilidad y teclado

- Roles y nombres accesibles en el snapshot; región `aria-live` en el panel de análisis.
- Recorrido completo **solo con teclado** (`Tab`, `Shift+Tab`, `Enter`, `Escape`): foco visible y
  en orden; ningún control inalcanzable.
- Los estados de aplicabilidad se distinguen por **texto**, no solo por color.

## 3. Consola (Chrome DevTools MCP)

Recarga cada ruta y lista los mensajes. Cero errores. En particular:
- **violaciones de la CSP** (`Refused to execute inline script`, `Refused to load`): nunca se
  "arreglan" relajando la CSP (US-216); se arregla el código o se pide un ADR;
- errores de **hidratación** (`Hydration failed`, `Text content does not match`);
- advertencias de React sobre `key` o efectos.

## 4. Red

Lista las peticiones del recorrido:
- el navegador **solo** llama a rutas `/api/*` del mismo origen y a sus propios assets; ninguna
  petición directa a `clinical-api`, `rag-orchestrator`, Milvus, MinIO ni terceros;
- **ninguna identidad del paciente** (nombre, documento, fecha de nacimiento, número de historia)
  en URLs, query strings ni cabeceras (RN-10); solo IDs opacos;
- mutaciones (`POST`, `PATCH`, `DELETE`) con cabecera `Origin`; cookie de sesión `HttpOnly`,
  `Secure` (en el piloto) y `SameSite=Strict`;
- cabeceras de respuesta de US-216 presentes (CSP con nonce, `frame-ancestors 'none'`,
  `X-Content-Type-Options`, `Referrer-Policy`).

## 5. Rendimiento

Traza de rendimiento de la ruta principal del change (sin el análisis de IA, que tiene su propio
p95): ficha y listado ≤ 1 s, vista de caso ≤ 2 s (PRD, NFR de rendimiento, a calibrar). Anota LCP,
CLS y las tareas largas que pasen de 200 ms. Es una medición de laboratorio en una máquina local:
**alerta, no FAIL**, salvo que multiplique la meta.

## 6. Capturas

Una captura por breakpoint de la vista final: **375 px** y **1280 px** (`browser_resize` +
`browser_take_screenshot`). Guárdalas en `reports/visual/L1D-<nn>/` (ignorado por git). No hagas
capturas de cada paso: el snapshot de accesibilidad es más barato y más preciso.

## 7. Cierre

Suelta el candado (`rmdir "$LOCK"`). Si encontraste fallos: test en rojo que lo reproduce → commit
`test(L1D-<nn>)` → corrección → commit `feat(L1D-<nn>)` → repite solo el paso
afectado. Si un recorrido es estable y no tiene E2E, propón convertirlo en un spec de Playwright
(`playwright-expert`) dentro del mismo change.

## Formato de salida (va al reporte del implementador y al cuerpo del PR)

```
## visual-check · <change> · <fecha>
Veredicto: PASS | FAIL | PENDIENTE (<motivo>)
Stack: Compose local · seed sintético · web http://localhost:<puerto>
| Paso | Ruta / estado | Resultado | Evidencia |
|---|---|---|---|
| Estados | /pacientes/<id>/caso · sin evidencia | ✓ | snapshot: encabezado y aviso RN-19 presentes |
| Diseño | vista de caso vs docs/ux/S3/ | ⚠ | aviso de faltantes debajo y no arriba (desviación reportada) |
| Teclado | panel de análisis | ✗ | foco se pierde tras cerrar el diálogo → test US-xxx AC-n (rojo) |
| Consola | /pacientes | ✓ 0 errores, 0 violaciones CSP | — |
| Red | todas | ✓ solo /api/*, sin PII en URLs, Origin en mutaciones | 14 peticiones |
| Rendimiento | ficha | ⚠ LCP 1,3 s (meta ≤ 1 s) | traza local |
| Capturas | 375 / 1280 | ✓ | reports/visual/L1D-<nn>/ |
Fallos convertidos en tests: <lista o "ninguno">
```

FAIL si hay un error de consola, una violación de CSP, una petición fuera del origen, PII en una
URL, un estado obligatorio ausente o un control inalcanzable por teclado sin su test en rojo y su
corrección.
