# S2 · Deuda y traslados (registrados el 2026-10-22, `[S2 resp. 18]`)

> Fuente: hojas de cierre del orquestador del S2 y `S2-status.md` (local). Linear no se toca: el workspace llegó al límite de issues; cada ítem queda en el Markdown de su historia destino.

## Traslados de tareas de L1D-173 (tipos de cáncer habilitados)

| Tarea | Qué pide | Destino |
|---|---|---|
| 4.3 | E2E con `ENABLED_CANCER_TYPES=mama`: la ficha (b) muestra el aviso de alcance | ~~US-079 (S3)~~ → **ARR-09** (S3, AC-2) `[S3 resp. 7]`; US-079 pasó al S5 |
| 4.4 | *visual-check* de la pantalla de alcance (375 y 1280 px, consola, CSP, red solo `/api/*`) | ~~US-079 (S3)~~ → **ARR-09** (S3, AC-1) `[S3 resp. 7]` |
| 5.1 | `openspec validate --strict` y suites en verde | Hecha: `openspec validate --changes --strict` y la CI de `main` en verde; sin traslado |

Con 5.1 cumplida y 4.3 y 4.4 trasladadas por escrito, L1D-173 se da por cerrada en el S2.

## Deuda menor → historia destino

| Deuda | Dónde | Destino |
|---|---|---|
| Índice del nombre `full_name_hmac` nullable | `identity.patient_identity` | **US-234** (S6, AC-4) |
| Límite de tasa y auditoría `patient.search` (el `429` está declarado y sin implementar) | `POST /platform/patients/search` | **US-234** (S6, AC-1 a AC-3) |
| `SIN_RECHAZADOS` de `evidence-analysis` duplica `sqlDatoVigente` | `clinical-api` | **US-232** (S6): se resuelve al refactorizar el módulo |
| Aviso de UX cuando el formulario de búsqueda se envía antes de hidratar (hoy la página muestra JSON) | `web`, `/pacientes` | ~~US-079 (S3)~~ → **ARR-09** (S3, AC-3) `[S3 resp. 7]` |
| `form-action 'self'` en las cabeceras de seguridad | `web` | **US-144** / **US-216** (S6) |
| 413 y 502 del BFF sin declarar en el contrato; el mensaje del 502 dice «IA» | contrato + `web` | **US-216** (S6) o la próxima historia que toque el BFF |
| Q-1: `pattern` de `fullNameMasked` y exención equivalente en la regla AC-17 | contrato + `assertExamplesSynthetic` | **US-213b** (S3) |
| Excepciones de calidad por archivo (16) | `quality-thresholds.json` | **US-232** (S6); caducan el 2026-11-30 |
| ARR-03 AC-1, AC-2 y AC-5; `proveedor: local`; prompt `rag-query@0.2.0`; filtro solo nivel A | `evaluate` | **US-233** (S4) |
| Menores de #157 y #163 (`recibirCuerpo`, config inline de ESLint, `generated/`, `lint-imports --config`) | calidad | **US-232** y **US-213b** |

## Deuda del cierre (decisiones del usuario, 2026-10-22, `[S2 resp. 19]`)

| Deuda | Dónde | Destino |
|---|---|---|
| `original_filename` en claro en `clinical.document` (DEC-21, opción A) | `clinical-api`, L1D-56 | **US-235** (S6, 2 pts): cifrado o enmascarado y bloqueo en `preflight real-data` |
| El `202` de `uploadDocument` devuelve `originalFilename`: confirmar que la UI lo necesita | contrato + `web` | **US-235** (AC-2, S6) o **US-079** (S5), lo que llegue antes |
| **Seguridad, Medio:** `clinical-api` usa credenciales root de `clinical-minio` (`PutObject` con root, HTTP sin TLS ni SSE) | `clinical-api` + Compose | ~~S3, junto a US-078~~ → **US-078 AC-8** (S5) `[S3 resp. 7]`: usuario de servicio con política mínima sobre `clinical-documents`; TLS/SSE y red interna en **US-144** (S6) |
| **Bajo:** `web` comparte `clinical-net` con `postgres` y `clinical-minio` | Compose | **S6** (hardening de G-Piloto) |

## Traslados del refinamiento del S3 (decisiones del usuario, 2026-10-23, `[S3 resp. 7]`)

| Deuda | Dónde | Destino |
|---|---|---|
| *Visual-checks* pendientes: L1D-140 2.7 y 3.5, L1D-187 2.8, L1D-194 3.3, L1D-197 3.5, L1D-173 4.4 | `web` | **ARR-09** (S3, AC-1) |
| E2E huérfanos: L1D-173 4.3 (US-043 AC-3), L1D-202 3.3 (US-048 AC-1), L1D-72 3.3 (US-051 AC-1, AC-2 y AC-5); antes en US-079 AC-6 | `web` + CI | **ARR-09** (S3, AC-2); regresión en US-079 (S5) |
| Conciliación: L1D-166 5.2 y L1D-277 1.5 (activar `ac2-cited-sources-build`) | CI | **ARR-09** (S3, AC-4) |
| Destinos L1D-280 a re-anotar en `l1d-115`, `l1d-180`, `l1d-193`, `l1d-275` y `us-231b` | `openspec/changes` | **US-233** (S4), vía **ARR-09** (S3, AC-5); archivar lo ya cumplido (AC-6) |
| Medición de ADR-40: `l1d-205` tareas 1.4, 1.6, 3.1, 4.2 y 4.3 | `rag-orchestrator`, ADR-40 | **S5**, prerrequisito de **US-083** (antes: «al inicio del S3», `S2-cierre.md`) |
| Credenciales root de `clinical-minio` (ver «Deuda del cierre») | `clinical-api` + Compose | **US-078 AC-8** (S5) |
