# Entorno de la medición de ADR-39 fase B (notas para el ADR)

Registrado el 2026-10-19 (hora local) por el PO y el asistente. Solo valores de entorno; sin datos clínicos ni secretos.

| Dato | Valor |
|---|---|
| Equipo | Apple M5 Pro, 15 núcleos, **48 GB de RAM** (el equipo de referencia del proyecto es de 32 GB: desviación declarada) |
| macOS | 27.0.1 (build 26A434) |
| Python (CLI de medición) | 3.13.15 |
| Ollama | **0.34.4**, lanzado con `OLLAMA_CONTEXT_LENGTH=8192 OLLAMA_FLASH_ATTENTION=1 ollama serve` (`OLLAMA_KV_CACHE_TYPE` sin definir) |
| Docker Desktop | 29.8.0; VM con 8 CPU y 10,19 GiB de memoria (mínimo del protocolo: ≥ 10 GB) |
| Swap antes de medir | 1084,62 MB usados de 2048 MB; memoria libre 73 % |
| Modelos de Ollama ya descargados | A `gemma4:26b-a4b-it-qat` (15 GB), B `gemma4:12b-mlx` (7,7 GB), C `qwen3.5:9b-mlx` (8,9 GB) |
| vllm-metal | 0.1.0 instalado en `~/.venvs/vllm-metal` (Python 3.12) **sin el paquete `vllm`**; `uv pip install --dry-run vllm` instalaría vllm 0.11.0 y bajaría torch de 2.14.1 a 2.8.0; no se instaló |

## AC-1 · Ollama (candidato A)
`reports/adr39/runtime-ollama.json`: GPU 100 %, API compatible con OpenAI, JSON restringido por el runtime, `context_length` 8192 sin aviso.

## Actualización 2026-10-19
- Docker Desktop VM subida a 13 GB (usuario) antes del e2e; antes 10,19 GiB; mínimo del ADR >= 10 GB.
- Pesos ONNX de fase A exportados a ~/adr39-modelos (BGE-M3 int8, bge-reranker-v2-m3 int8, mDeBERTa fp32; un solo archivo).
- 2026-10-19: durante la medición de B el usuario descargó G, H y E y los ejecutó brevemente (cargas cortas, finalizadas al iniciar); medgemma1.5:4b se observó cargado en ollama ps durante la corrida de B. Swap observado 6,3 GB (inicio: 1,08 GB). B se evalúa con esta salvedad y se repite si las cifras son anómalas.

## Hallazgo del instrumento (2026-10-20): razonamiento por /v1
- Primera corrida de B (`reports/adr39/B-con-razonamiento/`, conservada como evidencia): JSON válido 0,20, p50 21,9 s, p95 25,4 s, 46,7 tok/s. Causa: por `/v1/chat/completions` sin control de razonamiento, `gemma4:12b-mlx` razona (`message.reasoning`) hasta agotar `max_tokens`=1024 (`finish_reason: length`) y deja `content` vacío en ~80 % de las llamadas. La configuración declaraba `thinking: false`, pero el script solo lo aplicaba a `/api/chat` (`think: false`), no a `/v1`.
- Comprobado a mano: `reasoning_effort: "none"` en `/v1` desactiva el razonamiento (B: 3,6–7 s, JSON válido, `finish_reason: stop`); `think: false` en `/v1` no tiene efecto. C, G, H y E aceptan el parámetro sin error.
- Corrección: el script envía `reasoning_effort: "none"` por `/v1` cuando `thinking` es false (test actualizado). **Consecuencia para el producto:** el adapter de producción (`cuerpo_de_peticion`) no envía ese campo; con un LLM que razona por defecto (gemma4) el análisis real fallaría igual. Debe añadirlo al fijar `LLM_MODEL` (tarea 1.9 / arrastre).
- B se vuelve a medir con la corrección. Servidor Ollama arrancado por la sesión con `OLLAMA_CONTEXT_LENGTH=8192 OLLAMA_FLASH_ATTENTION=1`.
