# Calibración de `retrieval_top_k` (US-120 AC-5)

Dataset s5-corpus-ampliado@1 (clase sintetico) · proveedor `local` · hashConfig `ddb1a877eee82666718edef8c068f2a0f85910bb283598d729d4314517f5e43e` · valor provisional 30.

| retrieval_top_k | fidelidad (proxy) | precisión de citas | «sin evidencia» | recall@10 | MRR |
|---|---|---|---|---|---|
| 10 | 0.708 | 1.000 | 0.928 | 0.906 | 0.863 |
| 20 | 0.692 | 1.000 | 0.986 | 0.953 | 0.898 |
| 30 | 0.695 | 1.000 | 0.942 | 0.906 | 0.887 |
| 50 | 0.695 | 1.000 | 0.957 | 0.922 | 0.880 |

Elegido: 20 (elegido; sin fijar: los valores definitivos se escriben en `Settings` y Compose tras la corrida con modelos locales, tarea 7.1)

Justificación: regla D3: menor k con recall@10 ≥ 0.933 (tolerancia 0.02 frente al mejor). 10 descartado: recall@10 0.906 < 0.933; 30 descartado: recall@10 0.906 < 0.933; 50 descartado: recall@10 0.922 < 0.933.
