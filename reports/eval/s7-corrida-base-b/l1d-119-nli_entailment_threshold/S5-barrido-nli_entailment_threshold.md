# Calibración de `nli_entailment_threshold` (US-120 AC-5)

Dataset s5-corpus-ampliado@1 (clase sintetico) · proveedor `local` · hashConfig `ddb1a877eee82666718edef8c068f2a0f85910bb283598d729d4314517f5e43e` · valor provisional 0.70.

| nli_entailment_threshold | fidelidad (proxy) | precisión de citas | «sin evidencia» | recall@10 | MRR |
|---|---|---|---|---|---|
| 0.50 | 0.789 | 1.000 | 0.942 | 0.906 | 0.887 |
| 0.60 | 0.748 | 1.000 | 0.942 | 0.906 | 0.887 |
| 0.70 | 0.670 | 1.000 | 0.942 | 0.906 | 0.887 |
| 0.80 | 0.667 | 1.000 | 0.942 | 0.906 | 0.887 |
| 0.90 | 0.607 | 1.000 | 0.942 | 0.906 | 0.887 |

Elegido: 0.50 (elegido; sin fijar: los valores definitivos se escriben en `Settings` y Compose tras la corrida con modelos locales, tarea 7.1)

Justificación: regla D3: mayor fidelidad con precisión de citas ≥ 0.900 y sin evidencia ≥ 0.900; empate → el más alto.
