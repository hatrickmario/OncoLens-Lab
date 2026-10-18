# S1 — Pendientes humanos (revisión y decisión)

> Salida del Sprint 1 · 2026-10-18 · Fuente: `openspec/changes/*/tasks.md`, `backlog/sprints/S1-plan.md` (decisiones 1–87) y el cierre del orquestador.
> Ninguno de estos pendientes bloquea `/sprint-close S1`: están diferidos por escrito con su ID.
> Los puntos marcados con (*) vienen de notas de sesiones anteriores y no se verificaron de nuevo contra el repo ni Linear el 2026-10-18: confirmarlos antes de agendarlos.

## A. Con los oncólogos — L1D-238 (US-075, baseline manual VM-1/VM-2; DEC-02)

Estado: In Review, tareas 3.1 a 3.5 abiertas, sin plazo fijo (decisión 81). El CLI se niega a generar el reporte hasta que se registren `version` y `fecha_validacion_clinica` en los 6 checklists (hoy `0.1-borrador`, `null`).

| Tarea | Qué se hace | Con quién | Opción recomendada |
|---|---|---|---|
| 3.1 | Validación clínica **antes de medir** de los 4 casos ficticios (`mama-02`, `mama-03`, `prostata-02`, `prostata-03`), los críticos y complementarios de los 6 checklists y las 6 preguntas de referencia (fecha de corte propuesta 2026-06-30). Registrar `version` (p. ej. `1.0`) y `fecha_validacion_clinica`. | Los dos oncólogos | Una sesión conjunta de 45 a 60 min |
| 3.1b | Decidir la etiqueta correcta de `prostata-01`: «primera línea metastásica» contradice T2cN0M0. | Los oncólogos | En la misma sesión |
| 3.2 | Sesiones manuales: 6 casos por participante, VM-1 y VM-2 cronometradas por separado, tope de 30 min por tarea. Guardar **fuera del repo** la correspondencia nombre ↔ `O1`/`O2`. PDFs exportados de los Markdown; herramientas sin NCCN ni ESMO. | Cada oncólogo | Dos sesiones de ~3 h, una por oncólogo |
| 3.3 | Registrar `eval/vm/baseline-S1.csv` desde `eval/vm/baseline-S1.template.csv`: una fila por caso y participante, sin nombres, fechas de sesión ni justificaciones. | PO | Rellenar durante la sesión |
| 3.3b | Validación ciega de VM-2: `python -m app.evaluation.vm pares-validacion …`; entregar solo caso, pregunta y fuente; trasladar el veredicto a `validada`. | Un tercer oncólogo (distinto de O1 y O2) | Evaluador ciego externo |
| 3.4 | `python -m app.evaluation.vm baseline --fecha <AAAA-MM-DD>` dos veces con la misma fecha (reportes idénticos byte a byte); versionar `baseline-S1.csv` y `baseline-S1.md` en un PR `chore` antes de `/sprint-close` (consentimiento de O1/O2 ya dado, resp. 23). | PO | — |
| 3.5 | Revisar en la sprint review las dos medianas de VM-2 (autoidentificada y validada), «metas no modificadas; criterio de éxito enmendado en DEC-02» y la nota de que la cohorte real viene después de G-Piloto. | PO | Presentarlo como línea base sintética |

Orden: 3.1 → 3.2 y 3.3 → 3.3b → 3.4 y 3.5. Dos puntos de diseño del PR #66 quedan como deuda: si VM-2 lista también como no completadas las fuentes no validadas, y si el patrón `O<n>` pasa a constante del dominio.

## B. Mediciones en el MacBook de referencia — L1D-274 (US-224, ADR-39 fase B)

Estado: In Review. Sin oncólogos. Repetir `llm`: los `llm.json` previos usaron `/api/chat` (#86 alinea la medición con la ruta `/v1` de producción). Arrancar el servidor Ollama con `OLLAMA_CONTEXT_LENGTH=8192`.

| Tarea | Qué se mide |
|---|---|
| 1.4 | Runtime: Ollama 0.34.4 y vllm-metal 0.1.0 |
| 1.5 | LLM: admisión por memoria (`ollama ps`, `num_ctx=8192`, tras el prompt más largo) |
| 1.6 | p95 extremo a extremo de `POST /platform/evidence-analyses`: 3 corridas de ≥ 30 consultas, vía web `/api/*` |
| 1.7 | OCR: OCRmyPDF + Tesseract `spa`, PaddleOCR (PP-OCRv5 latino) y docTR |
| 1.8 | Completar las cifras y la decisión del ADR-39 fase B |

Límites: p95 de `/platform/evidence-analyses` ≤ 15 s · extracción p95 ≤ 60 s · JSON válido ≥ 99 % · stack ≤ ~30 GB con LLM ≤ 21 GB. La tarea 1.9 (`.env.example`) la cubre el PR #90.

## C. Otras decisiones o verificaciones del PO

| Pendiente | Detalle |
|---|---|
| L1D-166 (US-036) 4.1 y 4.2 | Protección de `main` en GitHub (PR obligatorio, check `ci-ok`, sin bypass, rama al día). Solo el administrador; ningún agente cambia la configuración del repo. |
| CIE-10 (*) | Verificar los nombres de C50.9 y C61 (MinSalud/SISPRO). |
| LOINC, DEC-04 (*) | Términos de LOINC pendientes. |
| Linear (*) | Cambiar la automatización GitHub–Linear (hoy pasa a Done al mergear aunque falten tareas) y el límite de issues del plan gratuito. |
| `MODEL_HOST_DIR` | `ls` antes de levantar Compose: si existe `model.onnx.data` de embeddings o reranker, el arranque falla cerrado y significa que US-231a cargaba pesos sin verificar (abrir deuda). |
| Limpieza local de L1D-169 (*) | `docker compose -p oncolens169 down -v` y `/tmp/oncolens169-secrets`. |
| E2E y visual-check de L1D-139 (US-060) y L1D-140 | Dependen de D-3 (Playwright y perfil de test en Compose con `LLM_PROVIDER=fake` y `MODEL_PROVIDER=fake`, seed de `doc1@test.local`). Los 12 E2E están escritos y sin ejecutar. |
| D-9 | Seguridad web de `apps/web` (CSP, `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`): la historia dueña es US-216 (L1D-266), hoy en S6; el planning de S2 decide si se adelanta. |
| `servicios_reales` de L1D-115 (*) | Los archivos que además necesitan PostgreSQL de test con TLS no se corrieron en la sesión (los 23 casos de Milvus de L1D-106 sí pasaron). |

## D. Diferidas a US-072 (L1D-235), no son del PO

L1D-180 tareas 3.1 y 4.4 (OL-06 con el NLI real).

## E. Para `/sprint-close S1`

- Revisará a fondo las historias que la automatización pasó a Done sin cumplir todos los criterios: L1D-197, 115, 193, 238 y 180. Puede devolverlas a In Review.
- L1D-166, 139 y 274 siguen en In Review por tareas abiertas.
- Deuda sin issue de Linear (workspace en el límite del plan gratuito): ver `backlog/features/README.md` (D-1 a D-9) y los cuerpos de los PR.
