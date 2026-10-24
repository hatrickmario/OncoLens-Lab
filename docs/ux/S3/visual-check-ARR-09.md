# visual-check · ARR-09 · 2026-10-24

Resumen versionado del loop visual de ARR-09 (`frontend-dev`). Las capturas están en `reports/visual/ARR-09/` (ignorado por el control de versiones, solo locales). Sin datos reales, identidades ni credenciales: solo el seed sintético.

**Veredicto: PASS con alcance acotado.** Stack: Compose local, `LLM_PROVIDER=fake`, `MODEL_PROVIDER=fake`, seed sintético, `http://127.0.0.1:3000` (desde `localhost` el login responde `403` por `WEB_ALLOWED_ORIGIN`: es el control de `Origin`). Viewports: 375 y 1280 px.

## Cobertura

| Paso | Ruta / estado | Resultado | Evidencia |
|---|---|---|---|
| Estados | análisis: con opción, sin evidencia, solo descartadas, tipo no habilitado | ✓ | Encabezado «Opciones descritas en la evidencia»; aviso RN-19 en `role=note`; «Relevancia máxima: no aplica»; criterio de orden por relevancia de recuperación, sin aplicabilidad (RN-28); descartadas plegadas «solo para revisión»; aviso de alcance como `role=status` que no bloquea (RN-26). |
| Estados | Base del análisis, cita, Fragmento citado | ✓ | Resumen y detalle expandido, `aria-expanded`, «Fuente original» con enlace. |
| Estados | `/login` vacío y 401, `/pacientes`, ficha del paciente (b) | ✓ | Error 401 en `role=alert` con `aria-invalid`; listado con 5 pacientes SINTÉTICO y alcance en la columna. |
| Estados no recorridos | errores 5xx/429, sin opciones | ⚠ | Cubiertos por los E2E de `panel-analisis.spec.ts`; no replicados en el navegador. |
| Teclado | login, panel | ✓ | Login con Tab + Enter; orden cabecera, pregunta, botón; foco con contorno de 3 px. |
| Consola | todas las rutas | ✓ tras el fix | Un 404 de `/favicon.ico`, convertido en test rojo (`icono-de-la-aplicacion.test.ts`) y corregido con `app/icon.svg`. El 401 del login con contraseña errónea aparece como error de recurso, esperado. |
| Red | todas | ✓ | Solo `/api/auth/login`, `/api/evidence-analyses`, `/api/patients/search` (POST) y rutas RSC del mismo origen. La identidad viaja solo en el cuerpo del POST; en URLs solo UUID de paciente. |
| Capturas | 375 y 1280 | ✓ | Sin desbordamiento horizontal a 375 px. |

## Desviaciones de diseño (reportadas, no corregidas desde el código)

1. **Base del análisis:** el estado de menopausia se muestra con la clave cruda (`estado_menopausica: posmenopausica`). Deuda UX: etiqueta legible de `patientDataUsed` (Base); destino a asignar por el orquestador en `S3-status.md` (L1D-188 o historia nueva).
2. **Cita:** «Diseño del estudio» muestra el enum crudo `guia` de `studyDesign`. Destino: L1D-182 / US-127 (metadatos de la fuente) o deuda UX, a asignar por el orquestador.

## Limitaciones

- **Sin CSP todavía:** no hay `Content-Security-Policy`, `frame-ancestors` ni `nosniff`; D-9 / US-216 (S6, antes de G-Piloto) `[S2 resp. 7]`. No es una regresión.
- **Rendimiento no medido:** solo Playwright MCP; sin traza de Chrome DevTools MCP (alerta, no FAIL).
- **Aviso de hidratación de `/pacientes` (AC-3):** ARR-09 eligió el mínimo (botón «Buscar» deshabilitado con «Cargando la búsqueda…» hasta hidratar); si los chunks de JS no cargan, el formulario queda deshabilitado. Ver `pantallas-s3.md`.

## Fallos convertidos en tests

`icono-de-la-aplicacion.test.ts` (favicon) y el test de hidratación de `FormularioDeBusqueda` más su E2E (`pacientes-listado.spec.ts`).
