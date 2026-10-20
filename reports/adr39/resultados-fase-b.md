# Resultados de la fase B de ADR-39 (ejercicio académico)

Equipo: Apple M5 Pro, 48 GB (referencia del proyecto: 32 GB; los límites de 30 GB de stack y 21 GB de LLM se aplican tal cual). Ollama 0.34.4 con `OLLAMA_CONTEXT_LENGTH=8192 OLLAMA_FLASH_ATTENTION=1`. Docker Desktop 13 GB. Datos sintéticos. Protocolo y desviaciones: `plan-medicion-fase-b.md`, `notas-entorno-fase-b.md`.

## Registro de corridas del LLM
| Corrida | Candidato | Protocolo | Estado | Resultado |
|---|---|---|---|---|
| 0 | B `gemma4:12b-mlx` | 3x200 (iniciada, detenida a ~2 h por inviable) | Abortada (usuario) | Sin cifras: el CLI solo guarda al final. Ritmo observado ~21 s/llamada |
| 1 | B `gemma4:12b-mlx` | 1x100 + 20 nativas, sin control de razonamiento | **Inválida por el instrumento** | JSON válido 0,20 · p50 21,9 s · p95 25,4 s · 46,7 tok/s · prefill 1202 tok/s · memoria al admitir 8,18 GB · estructuración JSON 1,0, p95 11,9 s (`B-con-razonamiento/llm.json`) |
| 2 | B `gemma4:12b-mlx` | 1x100 + 20 nativas, `reasoning_effort: none` | **Válida** | JSON válido 1,00 · p50 3,28 s · p95 6,83 s · 46,1 tok/s · prefill 1202 tok/s · memoria al admitir 8,14 GB (100 % GPU, ctx 8192) · estructuración JSON 1,00, p95 2,10 s (`B/llm.json`). Pasa las eliminatorias de memoria LLM y JSON; falta fidelidad (20 salidas) y e2e |

### Corrida 1: por qué no cuenta para elegir
- Por `/v1/chat/completions`, `gemma4:12b-mlx` razona (`message.reasoning`) hasta agotar `max_tokens`=1024 (`finish_reason: length`) y devuelve `content` vacío en ~80 % de las llamadas. El 20 % válido (20 de 100) son las que respondieron sin agotar el tope. La latencia de ~22 s = 1024 tokens a ~46,7 tok/s.
- La configuración declaraba `thinking: false`, pero el script lo aplicaba solo a `/api/chat`. No es un fallo del modelo sino del instrumento; la corrida se conserva como evidencia.
- Verificación manual: `reasoning_effort: "none"` en `/v1` → 3,6–7 s, JSON válido, `finish_reason: stop`; `think: false` en `/v1` no tiene efecto. C, G, H y E aceptan el parámetro.
- Pico de memoria en el log de Ollama durante esa corrida: 12,7–15,7 GiB (`ollama ps`: 13–16 GB, 100 % GPU, contexto 8192), por debajo de 21 GB. Swap 2,4–2,7 GB (inicio 1,08 GB; macOS cambia el tamaño del swap dinámicamente).
- Hallazgo de producto: el adapter de `rag-orchestrator` no envía `reasoning_effort`; con un LLM que razona por defecto, el análisis real fallaría igual. Pendiente al fijar `LLM_MODEL` (tarea 1.9).

## Candidatos (LLM, protocolo reducido 1x100 + 20 nativas, `reasoning_effort: none`)
| Cand. | Tag | Licencia | Mem. al admitir (≤21) | JSON válido (≥0,99) | p50 / p95 (s) | tok/s | prefill tok/s | Estructuración JSON / p95 (s) | Estado LLM |
|---|---|---|---|---|---|---|---|---|---|
| B | gemma4:12b-mlx | Apache-2.0 | 8,14 GB | 1,00 | 3,28 / 6,83 | 46,1 | 1202 | 1,00 / 2,10 | pasa; pendiente fidelidad y e2e |
| C | qwen3.5:9b-mlx | Apache-2.0 | 9,03 GB | 1,00 | 3,77 / 8,70 | 38,8 | 10962 | 1,00 / 2,64 | pasa; pendiente fidelidad y e2e |
| G | gemma4:26b-a4b-it-q4_K_M | Apache-2.0 | 17,69 GB | 1,00 | 3,11 / 7,83 | 59,0 | 824 | 1,00 / 1,82 | pasa (margen 3,3 GB bajo 21); pendiente fidelidad y e2e |
| H | qwen3.6:27b-q4_K_M | Apache-2.0 (HF) | 16,81 GB | 1,00 | **15,26 / 30,73** | 12,5 | 172 | 1,00 / 8,92 | pasa memoria y JSON; **p95 del LLM solo (30,7 s) ya supera el e2e de 15 s** (inferido; el e2e solo puede ser mayor) |
| E | medgemma1.5:4b (= q4_K_M) | HAI-DEF (aceptada por el usuario) | 3,05 GB | 1,00 | 2,51 / 7,55 | 67,5 | 1148 | 1,00 / 1,40 | pasa; pendiente fidelidad y e2e (cuantización q4: riesgo de calidad en español) |

## Fidelidad en español (20 salidas por candidato, revisión manual por `ai-eval-runner`; detalle en `revision-fidelidad-detalle.md`)
Reglas: fidelidad ≥ 0,90 · salidas prescriptivas = 0 (RN-23) · salidas en otro idioma = 0. H no se revisó (descartado por latencia).
| Cand. | Fidelidad | Prescriptivas | Otro idioma | Veredicto de calidad |
|---|---|---|---|---|
| B | 1,00 (20/20) | 0 | 0 | pasa. Español correcto, casi literal |
| C | 0,75 (15/20) | 1 | 0 | **descartado**: fidelidad < 0,90 y una salida prescriptiva; 2 salidas vacías |
| E | 0,90 (18/20) | 1 | 0 | **descartado**: una salida prescriptiva ("se debe repetir…"); calcos y un error léxico (BPH) |
| G | 0,95 (19/20) | 0 | 0 | pasa. Mejor paráfrasis; 1 añadido no respaldado |
Salvedades: n = 20 por candidato (los IC son amplios); una sola revisora automática (sonnet), no un oncólogo; las salidas se asociaron a su pregunta por posición. Casos límite dejados como fieles: C1, B9, E20, B20.

## E2E `POST /platform/evidence-analyses` (entrando por el web, `/api/evidence-analyses`), stack completo
Stack: Compose real (postgres, milvus, clinical-api, rag-orchestrator con BGE-M3 int8, bge-reranker-v2-m3 int8 y mDeBERTa fp32 en CPU, web), corpus semilla de 10 documentos (310 chunks), paciente semilla `a`, usuario `doc1`; 3 corridas × 30 consultas; Docker 13 GB / 8 vCPU. Etapas: "no desglosado" (el pipeline no registra tiempos por etapa).
| Cand. | Errores | p50 / p95 total (s) | LLM (ollama ps) | Docker pico | Stack (LLM + Docker) ≤ 30 | Swap creciente | NFR-01 p95 ≤ 15 s |
|---|---|---|---|---|---|---|---|
| B | 0/90 | 18,05 / 18,36 | 10,8 GB | 11,8 GB | 22,6 GB | no | **no cumple (+3,4 s)** |
Incidencias del instrumento (ya corregidas): (1) el cuerpo de ejemplo usa un `patientId` que no está en el seed → 404; se usa el paciente semilla; (2) la cookie de sesión es `Secure` y httpx la descarta sobre `http://127.0.0.1` → 90 errores 401 (`e2e-B/intento1-sin-cookie-invalido.json`); (3) el script entraba por rutas de clinical-api, no publicadas → opción `--bff`.
| G | 0/90 | **9,71 / 9,90** | 17,7 GB | 11,6 GB | **29,29 GB** (margen 0,71 GB < 1 GB: riesgo declarado, D3 regla 5) | no | **cumple** |

Lectura (corregida tras medir G): la latencia del LLM solo en el arnés (3,3 s B; 3,1 s G) **no predice** el e2e: con el contexto real del pipeline (12 pares, chunks de 1024 tokens) B tarda 18,4 s y G 9,9 s. El arnés usa las citas del golden como contexto (más corto); el ranking de LLM debe decidirse con el e2e, no con la latencia aislada. Causa de la diferencia B/G sin determinar (el pipeline no registra tiempos por etapa): hipótesis, B genera más tokens o procesa peor el contexto largo con el runtime MLX; no se midió. p50 ≈ p95 porque la consulta es la misma y el pipeline es determinista (el p95 real con consultas variadas será mayor).
