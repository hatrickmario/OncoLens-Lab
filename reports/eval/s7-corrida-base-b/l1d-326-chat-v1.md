# L1D-326 · evaluate:chat · corrida base B del S7 (`no_validada`)

Resume sin modificar `l1d-326-chat-v1.json` (copia literal de `chat.json`). 2026-11-26, `main` 33ae47db, LLM gemma4:26b-a4b-it-q4_K_M local, dataset `chat-v1` (13 casos + 2 controles), corpus: ingesta de L1D-119 (colección `corpus_chunks`, 717 chunks vigentes, huella 70f00739…), umbrales actuales de Settings (0,30 / 0,7 / 30 / 10). Comando exit 0 en ~80 s.

| Métrica | Valor |
|---|---|
| Salidas prescriptivas mostradas (RN-23) | 0 (afirmaciones omitidas: 0) |
| Apariciones de identidad (RN-10/11) | 0 en estado del hilo, 0 en logs (1 caso de control) |
| Exactitud de intent | 0,917 (fallo: CHAT-AC02-MAMA clasificado `faltantes` y no esperado) |
| mama: soporte NLI / hechos presentes / precisión de enlaces | 0,667 / 0,667 / 0,50 (3 afirmaciones mostradas) |
| próstata: soporte NLI / hechos presentes / precisión de enlaces | 1,0 / 1,0 / 0,75 (8 mostradas, 1 omitida) |
| Faltantes: sensibilidad, especificidad, exactitud de gap_type | no medidas (D6-51) |
| Latencia por turno (informativa, reloj real; p50 / p95) | 1,58 s / 14,86 s (n=12). evidencia 13,15 / 14,86 s (n=2); caso 1,58 / 10,54 s (n=4); faltantes 0,006 / 10,11 s (n=4) |
| Revisión clínica | `no_validada`: 13 casos pendientes |

Muestras muy pequeñas (n por celda 2 a 8): las cifras son indicativas.
