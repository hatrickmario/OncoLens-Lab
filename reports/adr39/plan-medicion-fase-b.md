# Plan de medición ADR-39 fase B (ejercicio académico)

Reglas y candidatos fijados en `apps/rag-orchestrator/eval/configs/adr39-fase-b.yaml` (no se modifican tras ver cifras). Solo datos sintéticos, modelos locales.

## Alcance
Candidatos pedidos: B `gemma4:12b-mlx`, C `qwen3.5:9b-mlx`, G `gemma4:26b-a4b-it-q4_K_M` (18 GB), H `qwen3.6:27b-q4_K_M` (17 GB), E `medgemma1.5:4b` (= q4_K_M, 3,3 GB, HAI-DEF; antes q8_0).
Runtime: Ollama 0.34.4 (vllm-metal descartado y documentado). Sin medir (`pendiente`, nunca 0): A (salvo que se incluya), F, I, J; D descartado por tamaño.

## Por candidato (bloque de ~1 h, en este orden; la primera eliminatoria que falla descarta con su cifra)
1. Licencia (0 min): Apache/MIT/BSD elegible; HAI-DEF solo se elige con aceptación escrita; licencia no verificada → se mide pero no se elige.
2. Descarga + admisión por memoria (10–15 min): `ollama ps` con num_ctx 8192 tras el prompt más largo, mediana de 3; ≤ 21 GB y 100 % GPU.
3. Carga JSON/latencia (30–35 min): `python -m app.scripts.adr39 llm --candidato <ID> --muestras ~/adr39-muestras`; 3 corridas × 200 llamadas por `/v1`; JSON válido ≥ 99 %, p50/p95; tok/s y prefill por `/api/chat` (20 llamadas/corrida).
4. Fidelidad (10 min): ≥ 20 salidas fuera del repo revisadas por `ai-eval-runner`: fidelidad ≥ 0,90, 0 prescriptivas (RN-23), 0 en otro idioma.
5. Registro: fila en la tabla del ADR, con agregados en `reports/adr39/` y desviaciones (equipo de 48 GB frente a la referencia de 32 GB).

## Una sola vez, solo para los finalistas (1–2)
- E2E `/platform/evidence-analyses` p95 ≤ 15 s con stack completo y `docker stats`/swap ≤ 30 GB (requiere pesos ONNX de embeddings/reranker/NLI en `MODEL_HOST_DIR`: sin verificar).
- OCR por motor (ocrmypdf-tesseract, paddleocr, doctr): extracción p95 ≤ 60 s, exactitud ≥ 0,95. No depende del LLM.
- `decidir` → ADR-39 fase B (queda «propuesto» hasta que el usuario lo apruebe), `LLM_MODEL` (tarea 1.9).

## Orden
B → C → G → H → E. Antes de lanzar B se resuelven las dudas de abajo.

## Decisiones del usuario (2026-10-19)
- A queda sin medir (`pendiente`). Medir B, C, G, H, E.
- Se acepta la licencia HAI-DEF por escrito para E (RN-21): puede ser elegido.
- H: licencia verificada en Hugging Face (Qwen/Qwen3.6-27B: Apache-2.0); se mide y puede elegirse.
- E2E para los cinco candidatos (no solo finalistas): requiere los pesos ONNX en `MODEL_HOST_DIR` antes de empezar.

## Protocolo del LLM acotado (usuario, 2026-10-19)
Cada llamada tarda ~21 s (B); 3x(200+20) llamadas = ~3,5 h por candidato. Decisión: B termina con el protocolo original (3 corridas x 200); C, G, H y E con `eval/configs/adr39-fase-b-reducido.yaml` (1 corrida x 100 llamadas por /v1 + 20 nativas). Admisión por memoria (x3), fidelidad (20 salidas), e2e y OCR sin cambios. Declarar en el ADR: B y el resto no son del todo comparables; con 100 llamadas 1 fallo JSON = 1 % (límite de 99 %).
Cada candidato escribe a su `--out` propio (el CLI sobrescribe llm.json).
