# Baseline técnico del S1 (US-073)

## 1. Barrido de `relevance_threshold` (RN-02, TBD-03)

Grilla (`RELEVANCE_THRESHOLD_GRID`): 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90 · referencia 0.30 · tolerancia de recall (`THRESHOLD_RECALL_TOLERANCE`) 0.05.

| Umbral | Exactitud de «sin evidencia» | recall@10 tras umbral |
|---|---|---|
| 0.10 | 0.957 | 0.906 |
| 0.20 | 0.942 | 0.906 |
| 0.30 | 0.942 | 0.906 |
| 0.40 | 0.942 | 0.906 |
| 0.50 | 0.942 | 0.906 |
| 0.60 | 0.913 | 0.891 |
| 0.70 | 0.899 | 0.875 |
| 0.80 | 0.870 | 0.859 |
| 0.90 | 0.710 | 0.672 |

Elegido: 0.10 (sin fijar: falta `--fijar`)

Justificación: regla D1: mayor exactitud de «sin evidencia» con recall@10 ≥ 0.856 (referencia 0.30, tolerancia 0.05); empate → el más alto. 0.90 descartado: recall@10 0.672 < 0.856 (recall de la referencia menos la tolerancia 0.05).

## 2. Baseline técnico

Dataset s5-corpus-ampliado@1 (clase sintetico) · proveedor `local` · hashConfig `ddb1a877eee82666718edef8c068f2a0f85910bb283598d729d4314517f5e43e`. fidelidad (proxy) = porcentaje de opciones con cita y soporte NLI (el juez de fidelidad de ADR-41 solo corre con modelos reales).

Total y por tipo de cáncer: recall@10 y MRR son del ranking del reranker y no dependen del umbral; las demás métricas son de la fila elegida.

### Total

| Métrica | Valor | Meta inicial | Estado |
|---|---|---|---|
| recall@10 (tras reranker) | 0.906 | ≥ 0.8 | en meta |
| recall@10 es→en (tras reranker) | 0.914 | ≥ 0.7 | en meta |
| MRR | 0.887 | ≥ 0.6 | en meta |
| fidelidad (proxy) | 0.692 | ≥ 0.9 | fuera de meta |
| precisión de citas | 1.000 | ≥ 0.9 | en meta |
| sin evidencia | 0.957 | ≥ 0.9 | en meta |
| p95 de /platform/evidence-analyses | 17.9271 s | ≤ 20 s | en meta |

### Por tipo de cáncer (mama, próstata)

| Métrica | Valor | Meta inicial | Estado |
|---|---|---|---|
| mama · recall@10 (tras reranker) | 0.935 | ≥ 0.8 | en meta |
| mama · recall@10 es→en (tras reranker) | 0.941 | ≥ 0.7 | en meta |
| mama · MRR | 0.919 | ≥ 0.6 | en meta |
| mama · fidelidad (proxy) | 0.750 | ≥ 0.9 | fuera de meta |
| mama · precisión de citas | 1.000 | ≥ 0.9 | en meta |
| mama · sin evidencia | 0.971 | ≥ 0.9 | en meta |
| próstata · recall@10 (tras reranker) | 0.879 | ≥ 0.8 | en meta |
| próstata · recall@10 es→en (tras reranker) | 0.889 | ≥ 0.7 | en meta |
| próstata · MRR | 0.856 | ≥ 0.6 | en meta |
| próstata · fidelidad (proxy) | 0.639 | ≥ 0.9 | fuera de meta |
| próstata · precisión de citas | 1.000 | ≥ 0.9 | en meta |
| próstata · sin evidencia | 0.943 | ≥ 0.9 | en meta |

### Por tipo de cáncer e idioma (es, en, es→en)

Una celda sin consultas es «no medida» (no 0.0). es→en: consultas en español contra el corpus en inglés.

| Métrica | Valor | Meta inicial | Estado |
|---|---|---|---|
| mama · es · recall@10 (tras reranker) | 0.941 | ≥ 0.8 | en meta |
| mama · es · recall@10 es→en (tras reranker) | 0.941 | ≥ 0.7 | en meta |
| mama · es · MRR | 0.941 | ≥ 0.6 | en meta |
| mama · es · fidelidad (proxy) | 0.759 | ≥ 0.9 | fuera de meta |
| mama · es · precisión de citas | 1.000 | ≥ 0.9 | en meta |
| mama · es · sin evidencia | 0.947 | ≥ 0.9 | en meta |
| mama · en · recall@10 (tras reranker) | 0.929 | ≥ 0.8 | en meta |
| mama · en · recall@10 es→en (tras reranker) | sin medir | ≥ 0.7 | sin medir |
| mama · en · MRR | 0.893 | ≥ 0.6 | en meta |
| mama · en · fidelidad (proxy) | 0.741 | ≥ 0.9 | fuera de meta |
| mama · en · precisión de citas | 1.000 | ≥ 0.9 | en meta |
| mama · en · sin evidencia | 1.000 | ≥ 0.9 | en meta |
| mama · es→en · recall@10 (tras reranker) | 0.941 | ≥ 0.8 | en meta |
| mama · es→en · recall@10 es→en (tras reranker) | 0.941 | ≥ 0.7 | en meta |
| mama · es→en · MRR | 0.941 | ≥ 0.6 | en meta |
| mama · es→en · fidelidad (proxy) | 0.759 | ≥ 0.9 | fuera de meta |
| mama · es→en · precisión de citas | 1.000 | ≥ 0.9 | en meta |
| mama · es→en · sin evidencia | 0.941 | ≥ 0.9 | en meta |
| próstata · es · recall@10 (tras reranker) | 0.889 | ≥ 0.8 | en meta |
| próstata · es · recall@10 es→en (tras reranker) | 0.889 | ≥ 0.7 | en meta |
| próstata · es · MRR | 0.889 | ≥ 0.6 | en meta |
| próstata · es · fidelidad (proxy) | 0.594 | ≥ 0.9 | fuera de meta |
| próstata · es · precisión de citas | 1.000 | ≥ 0.9 | en meta |
| próstata · es · sin evidencia | 0.947 | ≥ 0.9 | en meta |
| próstata · en · recall@10 (tras reranker) | 0.867 | ≥ 0.8 | en meta |
| próstata · en · recall@10 es→en (tras reranker) | sin medir | ≥ 0.7 | sin medir |
| próstata · en · MRR | 0.817 | ≥ 0.6 | en meta |
| próstata · en · fidelidad (proxy) | 0.690 | ≥ 0.9 | fuera de meta |
| próstata · en · precisión de citas | 1.000 | ≥ 0.9 | en meta |
| próstata · en · sin evidencia | 0.938 | ≥ 0.9 | en meta |
| próstata · es→en · recall@10 (tras reranker) | 0.889 | ≥ 0.8 | en meta |
| próstata · es→en · recall@10 es→en (tras reranker) | 0.889 | ≥ 0.7 | en meta |
| próstata · es→en · MRR | 0.889 | ≥ 0.6 | en meta |
| próstata · es→en · fidelidad (proxy) | 0.594 | ≥ 0.9 | fuera de meta |
| próstata · es→en · precisión de citas | 1.000 | ≥ 0.9 | en meta |
| próstata · es→en · sin evidencia | 0.944 | ≥ 0.9 | en meta |

## 3. Latencia de punta a punta (G-5)

p95 medido en proceso (etapa `consulta`): 17.9271 s (mediana de 3 corridas).


## 5. Valoración de OUT-08 (fidelidad fuera de meta)

La fidelidad (proxy) quedó fuera de meta. Se valoran, **sin implementarlas** (`[S4 resp. 15]`, OUT-08, soluciones 3 y 4), dos
palancas para una decisión posterior: (3) dar contexto del fragmento al NLI (la afirmación se verifica contra el fragmento citado
y su entorno) y (4) un NLI más fuerte es↔en o un umbral por tipo de afirmación. Este baseline no cambia modelos, *chunking* ni
prompts; la decisión es de una historia aparte con su propia evaluación (OL-06).
