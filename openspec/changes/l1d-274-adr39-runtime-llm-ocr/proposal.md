# Proposal — l1d-274-adr39-runtime-llm-ocr

## Trazabilidad

L1D-274 · US-224 · ADR-39 fase B · FEAT-06a (L1D-16) · Sprint 1 (cierre) · Estimación **3** · Historia de ADR ·
IA-01, NFR-01, NFR-05, TBD-01 · SUP-2 · G-3, G-5, G-6 · RN-12, RN-13, RN-14, RN-21, RN-22 ·
readme §1.4 · US-224 AC-1…AC-6 (ex US-012 AC-6, AC-7, AC-8 y las partes OCR de AC-1 y p95 de AC-2) ·
`[S1 resp. 3, 5, 6, 10]` · Fuente: `backlog/features/FEAT-06a-analisis-walking-skeleton.md` §US-224;
contexto: `backlog/sprints/S1-refinamiento.md` §2 y §5, `backlog/02-adrs.md` §US-012 · ADR-39.

## Why

TBD-01 (runtime y modelos locales) es la decisión crítica del S1. La fase A (change de L1D-102,
US-012) fija lo que obliga a reindexar (*embeddings*, *reranker*, NLI). Falta fijar, **con cifras
medidas sobre el pipeline ya construido**, el runtime nativo del LLM, el LLM, el motor OCR y el p95
extremo a extremo de `POST /platform/evidence-analyses`. Sin esto el walking skeleton no puede
afirmar que cumple NFR-01 (p95 ≤ 15 s) dentro de NFR-05 (stack ≤ ~30 GB; antes 24 GB, Decidido (usuario, 2026-10-20)), el baseline técnico
(US-072/US-073) no tiene modelos fijados, ADR-41 no tiene juez local, ADR-42 no tiene p95, y la
extracción de FEAT-01b (S2) no tiene motor OCR elegido.

Decisiones ya tomadas que este change **no reabre** (se citan):

- **Hipótesis principal A** `[S1 resp. 5, 10]`: **Gemma 4 26B A4B QAT** (`gemma4:26b-a4b-it-qat`,
  MoE con ~4B activos, Q4 entrenado con cuantización, Apache 2.0) en **Ollama (GGUF/llama.cpp sobre
  Metal)**, fuera de Docker, con `num_ctx = 8192`; OCR **OCRmyPDF + Tesseract `spa`**.
- **Medición del refinamiento** (Decidido, usuario, 2026-10-13, `[S1 resp. 10]`, Ollama 0.34.4):
  `gemma4:26b-a4b-it-qat` = **15 GB residentes, 100 % GPU, ~79 tok/s** (~10 s para 800 tokens) y
  JSON con esquema correcto en **una** prueba. `gemma4:26b-mlx` se descartó (18 GB solo en pesos)
  porque el usuario fijó entonces un presupuesto de **~16 GB para el LLM** (con el stack en 24 GB).
  **Superado (Decidido, usuario, 2026-10-20):** el tope máximo del LLM local pasa a **21 GB** y el del
  stack total a **~30 GB** (equipo de referencia MacBook Pro M5 de 32 GB); la medición de 15 GB de A
  sigue siendo el punto de partida.
- **Candidatos ampliados** (Decidido, usuario, 2026-10-20): además de A, B y C se miden **D** Qwen 3.6
  35B-A3B Q4_K_M (`qwen3.6:35b-a3b-q4_K_M`, 24 GB publicados: se espera descarte por memoria, con la cifra
  medida), **E** y **F** MedGemma 1.5 4B en Q8_0 y BF16 (`medgemma1.5:4b-it-q8_0`, `…-bf16`; licencia
  HAI-DEF, condicionada a la aceptación del usuario) y **G** Gemma 4 26B-A4B Q4_K_M
  (`gemma4:26b-a4b-it-q4_K_M`, 18 GB). Tags, tamaños y licencias verificados en la fuente el 2026-10-20
  (tabla en design.md D3); las reglas de decisión se fijan antes de medir (design.md D3).
- **Respaldos medidos con el mismo protocolo** `[S1 resp. 5]`: B Gemma 4 12B (`gemma4:12b-mlx`, ya
  descargado) y C Qwen3.5-9B sin *thinking* (`qwen3.5:9b-mlx`, descargado); vllm-metal como runtime
  alternativo; PaddleOCR (PP-OCRv5 latino) y docTR como OCR alternativos.
- **Supuesto reemplazado** (Decidido, usuario, 2026-10-13, `[S1 resp. 5]`): "en el S1 solo
  candidatos de 7–8B" pasa a "hasta 26B MoE o 12B denso, siempre que el stack completo quepa en
  24 GB" (el 2026-10-20 el tope del stack sube a ~30 GB y el del LLM a 21 GB, ver abajo).
- **Descartados por licencia**: Surya (GPL-3.0 + OpenRAIL-M con umbral comercial). **No se reabre**:
  nube para datos reales (RN-12); vision-LLM directo para OCR (readme §1.4).
- Supuestos "(asumido)" de los AC aceptados en bloque `[S1 resp. 3]`; la partida US-012 → fase A +
  fase B es `[S1 resp. 6]` (retro del Pre-S1, P-5).

## What Changes

- **Completa** `docs/architecture/adr/ADR-39-modelos-locales.md` (MADR; lo crea el change de L1D-102
  en la fase A) con la sección **Fase B**: runtime (AC-1), LLM (AC-2), p95 extremo a extremo por
  etapa (AC-3), configuración resultante (AC-4), protocolo repetible (AC-5) y OCR (AC-6), con cifra
  medida y motivo por cada candidato descartado, y el estado final del ADR.
- **Nuevo** script repetible de medición de la fase B en `apps/rag-orchestrator/app/scripts/adr39/`
  (subcomandos `runtime`, `llm`, `e2e`, `ocr`; 3 corridas, mediana; salida JSON en
  `reports/adr39/`) reutilizable en el S4 para recalibrar G-5 con síntesis, aplicabilidad y agente
  (AC-5).
- **Nuevo** dataset `data/eval/ocr-mini/`: ≥ 5 PDF sintéticos escaneados en español, generados por
  un script versionado, con verdad de terreno por campo crítico y manifiesto `clase: sintetico`
  (AC-6). Sin datos reales ni identificadores de pacientes (RN-13, RN-14).
- **OCR y disco** (Gate 1, 2026-10-14): el criterio de D5 incluye "escribe a disco" (OCRmyPDF y
  Tesseract usan archivos temporales); la medición corre con la mitigación obligatoria —
  `rag-orchestrator` con `read_only: true` y `TMPDIR` en `tmpfs` (Compose de L1D-164)— y un test
  comprueba que no quedan archivos tras la extracción; el adapter usa un `TemporaryDirectory` por
  request con limpieza en `finally`, y el ADR fija como consecuencia para el adapter OCR de
  FEAT-01b ese directorio por request y el test de no-residuos también con fallo y con timeout.
- **Protocolo ampliado** (2026-10-20): la memoria se mide con `ollama ps` y contexto de trabajo
  (`num_ctx=8192`, tras el prompt más largo), con admisión previa por memoria, calidad en español, JSON
  válido ≥ 99 %, p95 de extracción ≤ 60 s y holgura (swap y `memory_pressure`); un candidato que no
  quepa en 21 GB medidos se descarta con su cifra (design.md D1, D3).
- **Fija en configuración** (RN-22) el runtime, modelo, versión y parámetros elegidos (`LLM_BASE_URL`,
  `LLM_MODEL`, `LLM_NUM_CTX`, y equivalentes del adapter OCR), en `.env.example` y el módulo de
  configuración de `rag-orchestrator`, nunca en el código (AC-4).
- **Resuelve o descarta** vllm-metal: 0.1.0 está instalado en `~/.venvs/vllm-metal` **sin el paquete
  `vllm`** (pendiente heredado del refinamiento, §5); AC-1 lo instala según el README de vllm-metal o
  descarta el runtime con ese motivo.
- No cambia ningún contrato (`openapi.yaml`) ni ninguna spec de `openspec/specs/`: el change declara
  `skip_specs: true` porque su entregable es el registro de la decisión (historia de ADR).

## Capacidades afectadas

Ninguna spec se modifica (`skip_specs: true`). Capacidad relacionada, sin delta: `ai-evaluation`
(el script y `data/eval/ocr-mini/` los reutilizan US-072/US-073 y ADR-41). La configuración de
modelos se verifica con un test de configuración (test después), no con una spec nueva; el control
RN-12 de proveedores lo especifica US-050 (S6).

## Bounded contexts

- **ai-services** (único): `apps/rag-orchestrator/app/scripts/adr39/`, configuración de
  `rag-orchestrator`, `data/eval/ocr-mini/`, `docs/architecture/adr/ADR-39-modelos-locales.md`.
- La medición extremo a extremo (AC-3) **llama** a `POST /platform/evidence-analyses` del Compose
  local como cliente HTTP; no modifica `clinical-platform` ni `frontend`.

## Dependencias

- ↪ **change de L1D-102 (US-012 · ADR-39 fase A)**: crea `ADR-39-modelos-locales.md`, fija
  *embeddings*/*reranker*/NLI, el mini-dataset `data/eval/adr39-mini/` (insumo del AC-2) y el
  presupuesto por etapa que usa el AC-3.
- ↪ **change de L1D-275 (US-225, generación y recorte)**: el prompt del S1 y la generación contra
  `RagQueryInternalResponse` (AC-2, AC-3).
- ↪ **change de L1D-164 (US-034)**: Compose, perfil `LLM_PROVIDER=fake` y `.env.example` donde se
  fijan los valores (AC-3, AC-4).
- ↪ Para el AC-3 (pipeline del S1 completo): change de L1D-106 (US-055, recuperación), de L1D-179
  (US-063, citas), de L1D-180 (US-064, soporte NLI) y el gateway (change de L1D-103, US-052, y de
  L1D-104, US-053). Por eso la historia va al **cierre** del sprint.
- 🔗 Bloquea: US-072/US-073 (baseline con modelos fijados), US-014 · ADR-41 (juez local),
  FEAT-01b (OCR, S2), ADR-42 (p95). **No bloquea** a las historias que trabajan con
  `LLM_PROVIDER=fake`.

## Fuera de alcance

- Implementar el pipeline (US-055, US-225) o el adapter real de OCR y la estructuración (FEAT-01b,
  S2): aquí solo se mide y se fija la elección.
- *Fine-tuning*. Detector de PII (ADR-40). Framework de evaluación y juez (ADR-41). Streaming de
  progreso (ADR-42). Proveedores de nube para datos reales (RN-12).
- El test de la **regla de proveedores** (US-050) llega en el S6: el AC-4 deja los valores en
  configuración y la regla queda como **Regresión [RN-12] activa desde S6 (US-050)**.
- Decodificación especulativa (MTP en vllm-metal) solo se mide si la hipótesis A falla el p95 y el
  runtime es viable (palanca, no alcance comprometido).
