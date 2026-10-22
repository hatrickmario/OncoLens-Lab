# Baseline técnico del S1 (US-073)

## 1. Barrido de `relevance_threshold` (RN-02, TBD-03)

> Calibración con adapters falsos (FX-T5a-a): demuestra el mecanismo y no se aplica. El valor real de `RELEVANCE_THRESHOLD` sale del barrido con los modelos de ADR-39 (sección 4).

Grilla (`RELEVANCE_THRESHOLD_GRID`): 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90 · referencia 0.30 · tolerancia de recall (`THRESHOLD_RECALL_TOLERANCE`) 0.05.

| Umbral | Exactitud de «sin evidencia» | recall@10 tras umbral |
|---|---|---|
| 0.10 | 1.000 | 1.000 |
| 0.20 | 1.000 | 1.000 |
| 0.30 | 1.000 | 1.000 |
| 0.40 | 1.000 | 1.000 |
| 0.50 | 1.000 | 1.000 |
| 0.60 | 1.000 | 1.000 |
| 0.70 | 1.000 | 1.000 |
| 0.80 | 1.000 | 1.000 |
| 0.90 | 1.000 | 1.000 |

Elegido: 0.90 (sin fijar: falta `--fijar`)

Justificación: regla D1: mayor exactitud de «sin evidencia» con recall@10 ≥ 0.950 (referencia 0.30, tolerancia 0.05); empate → el más alto.

## 2. Referencia determinista (adapters falsos): valida el mecanismo, no cuantifica el sistema

Dataset fx-t5a-a@1 (clase sintetico) · proveedor `fake` · hashConfig `57b8a05d02374409d1aa6f7b420e9c8834b1957bb7041e44c33d79c54cd85ced`. fidelidad (proxy) = porcentaje de opciones con cita y soporte NLI (el juez de fidelidad de ADR-41 solo corre con modelos reales).

Total y por tipo de cáncer: recall@10 y MRR son del ranking del reranker y no dependen del umbral; las demás métricas son de la fila elegida (sin significado con adapters falsos).

### Total

| Métrica | Valor | Meta inicial | Estado |
|---|---|---|---|
| recall@10 (tras reranker) | 1.000 | ≥ 0.8 | en meta |
| recall@10 es→en (tras reranker) | 1.000 | ≥ 0.7 | en meta |
| MRR | 1.000 | ≥ 0.6 | en meta |
| fidelidad (proxy) | 0.600 | ≥ 0.9 | fuera de meta |
| precisión de citas | 0.800 | ≥ 0.9 | fuera de meta |
| sin evidencia | 1.000 | ≥ 0.9 | en meta |
| p95 de /platform/evidence-analyses | sin medir | ≤ 15 s | sin medir |

### Por tipo de cáncer (mama, próstata)

| Métrica | Valor | Meta inicial | Estado |
|---|---|---|---|
| mama · recall@10 (tras reranker) | 1.000 | ≥ 0.8 | en meta |
| mama · recall@10 es→en (tras reranker) | 1.000 | ≥ 0.7 | en meta |
| mama · MRR | 1.000 | ≥ 0.6 | en meta |
| mama · fidelidad (proxy) | 1.000 | ≥ 0.9 | en meta |
| mama · precisión de citas | 1.000 | ≥ 0.9 | en meta |
| mama · sin evidencia | 1.000 | ≥ 0.9 | en meta |
| próstata · recall@10 (tras reranker) | 1.000 | ≥ 0.8 | en meta |
| próstata · recall@10 es→en (tras reranker) | 1.000 | ≥ 0.7 | en meta |
| próstata · MRR | 1.000 | ≥ 0.6 | en meta |
| próstata · fidelidad (proxy) | 0.333 | ≥ 0.9 | fuera de meta |
| próstata · precisión de citas | 0.667 | ≥ 0.9 | fuera de meta |
| próstata · sin evidencia | 1.000 | ≥ 0.9 | en meta |

## 3. Latencia de punta a punta (G-5)

p95 de `/platform/evidence-analyses` de punta a punta: NO-EJECUTABLE aquí (requiere Compose y los modelos de ADR-39).

## 4. Baseline real (AC-2): pendiente

| Métrica | mama | próstata |
|---|---|---|
| recall@10 | NO-EJECUTABLE aquí | NO-EJECUTABLE aquí |
| MRR | NO-EJECUTABLE aquí | NO-EJECUTABLE aquí |
| recall@10 es→en | NO-EJECUTABLE aquí | NO-EJECUTABLE aquí |
| fidelidad (proxy) | NO-EJECUTABLE aquí | NO-EJECUTABLE aquí |
| precisión de citas | NO-EJECUTABLE aquí | NO-EJECUTABLE aquí |
| sin evidencia | NO-EJECUTABLE aquí | NO-EJECUTABLE aquí |

Cifras reales (modelos de ADR-39 + Compose) en la máquina de referencia (MacBook Pro M5 de 32 GB):

1. Verificar los modelos desde la fuente: `ollama list` (tags y tamaños) y `ollama ps` (residencia y memoria) con el LLM de ADR-39 fase B.
2. Levantar el stack: `docker compose -f infra/docker/docker-compose.yml up -d` y el LLM nativo (`ollama serve`).
3. Barrido real: `npm run evaluate -- --config apps/rag-orchestrator/eval/configs/<config-local>.yaml --sweep relevance_threshold --fijar --salida apps/rag-orchestrator/eval/reports` (la regla D1 usa solo desarrollo + validación de `ol06-particion-v1`; la prueba solo con `--prueba-final`).
4. p95 de punta a punta: 3 corridas de ≥ 30 consultas desde el host, por la BFF: `python -m app.scripts.adr39 e2e --bff --base-url https://localhost --origin https://localhost` (`ADR39_PASSWORD` en el entorno); nunca desde un contenedor de clinical-net/ai-net ni desde rag-orchestrator. La mediana de los p95 se pasa con `--p95-e2e-s <segundos>`.
5. Regenerar el baseline: `npm run evaluate -- --suite all --report json --config <config-local> --salida data/evaluation --nombre-archivo baseline.json`.
6. Aplicar el valor elegido en `RELEVANCE_THRESHOLD` de `.env.example` (lo hace el orquestador) y registrarlo para DEC-07 (US-017) y `regression.yaml` (US-074).
