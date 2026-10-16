# Tasks — l1d-274-adr39-runtime-llm-ocr

> Historia de ADR (US-224 · ADR-39 fase B). Matriz TDD (CLAUDE.md): el ADR y las mediciones son
> **exento**; los scripts (benchmark y generador del dataset) y la configuración son **test
> después** (el test en el mismo PR); la elección de modelo es **evaluate** (en el S1, revisión a
> mano de `ai-eval-runner`, `[Pre-S1 resp. 9]`). Sin cambios de API: no hay sección `## contratos`.
> Solo datos sintéticos (RN-13, RN-14). Todo en el bounded context **ai-services**.
>
> **Orden:** 1.1–1.4 pueden empezar en cuanto exista el change de L1D-102 (fase A); 1.5–1.7 esperan
> al pipeline del S1 (L1D-106, L1D-275, L1D-179, L1D-180, gateway L1D-103/L1D-104) y al Compose de
> L1D-164. Commits: `chore(L1D-274)` scripts y dataset → `test(L1D-274)` tests de los scripts →
> `docs(L1D-274)` ADR → `chore(L1D-274)` configuración → `refactor(L1D-274)`.

## 1. ai-services

- [ ] 1.1 Script repetible `apps/rag-orchestrator/app/scripts/adr39/` con subcomandos `runtime`,
      `llm`, `e2e`, `ocr` (3 corridas, mediana; parámetros desde la configuración; salida JSON en
      `reports/adr39/`) y funciones puras `mediana()`, `percentil_95()`,
      `descartar_por_restriccion()` (NFR-01, NFR-05, licencia), `desempatar_por_memoria()` y
      `validar_contra_esquema()`; reutilizar el arnés de la fase A si existe · **test después**
      `[US-224 AC-5]`
- [ ] 1.2 Tests Pytest del script (`test_<unidad>_<escenario>_<resultado>`): percentiles, descarte por
      p95 > 15 s / memoria total > ~30 GB o swap creciente / LLM > 21 GB / JSON < 99 % / OCR o extracción p95 > 60 s, empate (≤ 1 salida de diferencia en fidelidad) por menor
      memoria y JSON inválido contra `RagQueryInternalResponse`; HTTP del runtime y del gateway con
      `respx`, reloj inyectado · **test después** `[US-224 AC-5]`
- [ ] 1.3 Dataset `data/eval/ocr-mini/`: generador versionado de ≥ 5 PDF escaneados en español (mama
      y próstata, valores ficticios), `ground_truth.json` por campo crítico y `manifest.json` con
      `clase: sintetico` y licencia; test de humo que comprueba conteo, manifiesto y que cada PDF
      tiene su verdad de terreno · **test después** `[US-224 AC-6]` `[RN-13]` `[RN-14]`
- [ ] 1.4 Runtime: medir Ollama 0.34.4 y vllm-metal 0.1.0 (instalar `vllm` en
      `~/.venvs/vllm-metal` según su README, time-box 1 h, o descartar con el motivo y el comando
      probado); registrar GPU Metal real, API OpenAI-compatible y JSON restringido por esquema ·
      **exento** `[US-224 AC-1]`
- [ ] 1.5 LLM: medición de admisión por memoria (`ollama ps`, `num_ctx=8192`, tras el prompt más largo;
      descarte con cifra si > 21 GB) y después 200 llamadas por candidato admitido (A
      `gemma4:26b-a4b-it-qat`, B `gemma4:12b-mlx`, C `qwen3.5:9b-mlx` sin *thinking*, **D**
      `qwen3.6:35b-a3b-q4_K_M` sin *thinking*, **E** `medgemma1.5:4b-it-q8_0`, **F**
      `medgemma1.5:4b-it-bf16`, **G** `gemma4:26b-a4b-it-q4_K_M`; D–G añadidos el 2026-10-20) con el
      prompt del S1 sobre `data/eval/adr39-mini/`; memoria (pesos + KV), tok/s, JSON válido (≥ 99 %),
      fidelidad y calidad en español en la muestra revisada por `ai-eval-runner`, p95 de
      estructuración por documento sobre el texto de `ocr-mini`, licencia (E y F: HAI-DEF, elección
      sujeta a aceptación del usuario) y quién aplica la restricción; aplicar las reglas de decisión de
      design.md D3 (fijadas antes de medir); contrastar con la medición del refinamiento (15 GB, 100 %
      GPU, ~79 tok/s, `[S1 resp. 10]`) · **evaluate** `[US-224 AC-2]`
- [ ] 1.6 p95 extremo a extremo: 3 corridas de ≥ 30 consultas a `POST /platform/evidence-analyses`
      contra Compose con seed sintético y LLM real; p95 total y por etapa; memoria total del stack;
      descartar con cifra o escalar al usuario (US-012 AC-5); registrar `memory_pressure` y swap (holgura
      de macOS) y la RAM de la máquina de medición · **evaluate** `[US-224 AC-3]` `[NFR-01]` `[NFR-05]`
- [ ] 1.7 OCR: medir OCRmyPDF + Tesseract `spa`, PaddleOCR (PP-OCRv5 latino) y docTR dentro del
      contenedor de `rag-orchestrator` sobre `data/eval/ocr-mini/`: exactitud por campo crítico,
      p95 por documento (≤ 60 s), memoria, licencia y **si escribe a disco y dónde**, con el
      contenedor en `read_only: true` y `TMPDIR=/tmp` sobre `tmpfs` (Compose de L1D-164); motor que
      necesite escribir fuera de `TMPDIR` o quitar `read_only` → descartado con el motivo (design.md
      D5) · **evaluate** `[US-224 AC-6]` `[RN-14]`
- [ ] 1.7b Test de no-residuos del subcomando `ocr` (Pytest, test después): "no deja archivos en
      TMPDIR ni fuera de él después de extraer cada PDF de ocr-mini", que falla nombrando motor y
      ruta, nunca el contenido; el subcomando usa un `TemporaryDirectory` por request con limpieza en
      `finally`; el ADR registra como consecuencia obligatoria del adapter OCR de FEAT-01b ese
      directorio por request y el test de no-residuos también con **fallo** del motor y con
      **timeout** · **test después** `[US-224 AC-6]` `[RN-14]`
- [ ] 1.8 Completar `docs/architecture/adr/ADR-39-modelos-locales.md` (sección Fase B): tablas de
      AC-1, AC-2, AC-3 y AC-6 con medianas y descartes con cifra, decisión, consecuencias,
      configuración (RN-22), confirmación y comando repetible; citar `[S1 resp. 3, 5, 6, 10]`;
      estado propuesto hasta la aprobación del usuario · **exento** `[US-224 AC-1…AC-6]`
- [ ] 1.9 Configuración: fijar `LLM_BASE_URL`, `LLM_MODEL`, `LLM_NUM_CTX`, `LLM_TEMPERATURE`,
      `OCR_ENGINE`, `OCR_LANGUAGES` (y `LLM_CLOUD_ENABLED=false`) en `.env.example` y en la
      configuración de `rag-orchestrator`; test de configuración: valores leídos del entorno y ningún
      nombre de modelo literal fuera de la configuración. Anotar **Regresión [RN-12] activa desde S6
      (US-050)** · **test después** `[US-224 AC-4]` `[RN-22]`
- [ ] 1.10 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de
      comportamiento, tests en verde antes y después, commit refactor(L1D-274)

## 2. evaluación

- [ ] 2.1 `ai-eval-runner` revisa a mano la muestra de fidelidad y la ausencia de lenguaje
      prescriptivo (RN-23) del LLM elegido y deja el reporte en `reports/eval/` (insumo del baseline
      de US-072/US-073) · **evaluate** `[US-224 AC-2]`

## 3. Verificación

- [ ] 3.1 `openspec validate l1d-274-adr39-runtime-llm-ocr --strict` en verde
- [ ] 3.2 Tests de `rag-orchestrator` en verde (Pytest del script y de configuración)
- [ ] 3.3 `run-ai-eval` en su modo manual del S1 (cambia el modelo); sin `contracts:verify-provider`
      (no hay cambios de API)
