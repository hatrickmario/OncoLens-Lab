# S2 · Deuda y traslados (registrados el 2026-10-22, `[S2 resp. 18]`)

> Fuente: hojas de cierre del orquestador del S2 y `S2-status.md` (local). Linear no se toca: el workspace llegó al límite de issues; cada ítem queda en el Markdown de su historia destino.

## Traslados de tareas de L1D-173 (tipos de cáncer habilitados)

| Tarea | Qué pide | Destino |
|---|---|---|
| 4.3 | E2E con `ENABLED_CANCER_TYPES=mama`: la ficha (b) muestra el aviso de alcance | **US-079** (S3, L1D-59): la ficha y su E2E ya existen en `main` tras L1D-72 y L1D-278; se verifica allí |
| 4.4 | *visual-check* de la pantalla de alcance (375 y 1280 px, consola, CSP, red solo `/api/*`) | **US-079** (S3), con el stack de CI |
| 5.1 | `openspec validate --strict` y suites en verde | Hecha: `openspec validate --changes --strict` y la CI de `main` en verde; sin traslado |

Con 5.1 cumplida y 4.3 y 4.4 trasladadas por escrito, L1D-173 se da por cerrada en el S2.

## Deuda menor → historia destino

| Deuda | Dónde | Destino |
|---|---|---|
| Índice del nombre `full_name_hmac` nullable | `identity.patient_identity` | **US-234** (S6, AC-4) |
| Límite de tasa y auditoría `patient.search` (el `429` está declarado y sin implementar) | `POST /platform/patients/search` | **US-234** (S6, AC-1 a AC-3) |
| `SIN_RECHAZADOS` de `evidence-analysis` duplica `sqlDatoVigente` | `clinical-api` | **US-232** (S6): se resuelve al refactorizar el módulo |
| Aviso de UX cuando el formulario de búsqueda se envía antes de hidratar (hoy la página muestra JSON) | `web`, `/pacientes` | **US-079** (S3), con la pantalla de ficha y listado |
| `form-action 'self'` en las cabeceras de seguridad | `web` | **US-144** / **US-216** (S6) |
| 413 y 502 del BFF sin declarar en el contrato; el mensaje del 502 dice «IA» | contrato + `web` | **US-216** (S6) o la próxima historia que toque el BFF |
| Q-1: `pattern` de `fullNameMasked` y exención equivalente en la regla AC-17 | contrato + `assertExamplesSynthetic` | **US-213b** (S3) |
| Excepciones de calidad por archivo (16) | `quality-thresholds.json` | **US-232** (S6); caducan el 2026-11-30 |
| ARR-03 AC-1, AC-2 y AC-5; `proveedor: local`; prompt `rag-query@0.2.0`; filtro solo nivel A | `evaluate` | **US-233** (S4) |
| Menores de #157 y #163 (`recibirCuerpo`, config inline de ESLint, `generated/`, `lint-imports --config`) | calidad | **US-232** y **US-213b** |
