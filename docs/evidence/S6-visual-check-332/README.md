# Evidencia de L1D-332 (US-274)

- `vitest-rojo.txt`: AC-1 y AC-2 fallan en la aserción antes de `feat(L1D-332)` (AC-3 y AC-4 son guardas de regresión: pasan desde el inicio).
- `vitest-verde.txt`: los cinco tests de `conversacion-aviso-ampliacion.test.tsx` en verde.
- Capturas: `01-ampliacion-1280.png`, `02-ampliacion-375.png`, `03-sin-opciones-375.png`.

## visual-check

## visual-check · l1d-332-aviso-ampliacion-visible · 2026-11-07
Veredicto: PASS con una limitación (Chrome DevTools MCP no conectó: sin traza de rendimiento ni consola por DevTools; la consola y la red se leyeron con Playwright MCP).
Stack: Compose local (`-p oncolens-e2e332`) · `LLM_PROVIDER=fake` · seed sintético · web http://127.0.0.1:3000

| Paso | Ruta / estado | Resultado | Evidencia |
|---|---|---|---|
| Estados | chat del paciente semilla (a) · «¿Qué evidencia hay para este caso?» | ✓ | snapshot: encabezado «Opciones descritas en la evidencia», región «Avisos de la respuesta» con los dos avisos de RN-19 y «La búsqueda se amplió con datos del caso: tipo, estadio y biomarcador», luego criterio de orden y la opción |
| Estados | «Q-TOX» (evidencia recuperada sin opciones) | ✓ | snapshot: sin encabezado de opciones; «Alcance de la respuesta» con «Evidencia recuperada sin opciones soportadas» y el alcance, sin plegar |
| Diseño | vs `docs/ux/sistema-de-diseno.md` | ⚠ | el rótulo «Alcance de la respuesta» se repite en cada bloque `limitacion` (mismo comportamiento que ya tenían los turnos sin `evidenceAnalysis`); se reporta, no se cambia |
| Teclado / a11y | región de avisos y bloques | ⚠ parcial | roles y nombres correctos en el snapshot; sin recorrido completo por teclado en esta pasada (sin controles nuevos); axe lo cubren los E2E existentes del chat |
| Consola | recorrido completo | ✓ 0 errores, 0 advertencias | Playwright MCP |
| Red | recorrido completo | ✓ solo `/api/*` del mismo origen, sin identidad en URLs, POST a `/turns` | 5 peticiones dinámicas |
| Rendimiento | — | PENDIENTE | Chrome DevTools MCP no conectó |
| Capturas | 375 / 1280 | ✓ | esta carpeta |
Fallos convertidos en tests: ninguno
