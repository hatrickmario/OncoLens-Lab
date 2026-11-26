# Diagnóstico por etapa de la consulta (diagnostico)

Configuración `diagnostico-local` (huella `0b785b2402be6a981ae8f0491ad5085790403f11ee59b11908ce717785b10bcf`), dataset `parafrasis-v1` versión 1 sobre el corpus `s5-corpus-ampliado` (release `rel-s5-corpus-ampliado-1`, 252 chunks), proveedor `local`.

Umbrales: RETRIEVAL_TOP_K 30, RERANKER_MAX_PAIRS 20, RELEVANCE_THRESHOLD 0.3, NLI_ENTAILMENT_THRESHOLD 0.7.
Rótulo: `no_validada` (revisión provisional: rol `ia`, 2026-11-22).

## Regla de asignación de la etapa

La pérdida se asigna a la primera etapa, en el orden del pipeline, que el fragmento esperado no supera:

1. `recuperacion_densa`: el fragmento esperado no está entre los RETRIEVAL_TOP_K candidatos densos.
2. `corte_de_pares`: el fragmento esperado es candidato y queda fuera de los RERANKER_MAX_PAIRS pares del reranker.
3. `umbral_de_relevancia`: el fragmento esperado fue puntuado y su relevance_score no supera RELEVANCE_THRESHOLD.
4. `nli`: el fragmento esperado supera el umbral, hubo opciones con citas válidas y ninguna pasó el soporte del NLI.

## Recuento por etapa

- `recuperacion_densa`: 1
- `corte_de_pares`: 0
- `umbral_de_relevancia`: 1
- `nli`: 1
- `sin_asignar`: 0
- `sin_perdida`: 9

## Por par

| par | tipo | resultado | etapa | causa | redacción sin evidencia |
|---|---|---|---|---|---|
| P01 | coloquial_tecnico | sin_perdida | — | — | — |
| P02 | coloquial_tecnico | sin_perdida | — | — | — |
| P03 | coloquial_tecnico | perdida | recuperacion_densa | — | a |
| P04 | coloquial_tecnico | perdida | umbral_de_relevancia | — | b |
| P05 | sin_tildes | sin_perdida | — | — | — |
| P06 | sin_tildes | sin_perdida | — | — | — |
| P07 | orden | perdida | nli | — | b |
| P08 | orden | sin_perdida | — | — | — |
| P09 | orden | sin_perdida | — | — | — |
| P10 | es_en | sin_perdida | — | — | — |
| P11 | es_en | sin_perdida | — | — | — |
| P12 | es_en | sin_perdida | — | — | — |

## Por pregunta

| pregunta | chunk esperado | puesto denso | en pares | relevance_score | supera umbral | con evidencia | opciones generadas | afirmaciones aprobadas | afirmaciones descartadas |
|---|---|---|---|---|---|---|---|---|---|
| P01-a | ch-nci-prostata-hp-en-2 | 23 | False | — | — | False | — | — | — |
| P01-b | ch-nci-prostata-hp-en-2 | — | — | — | — | False | — | — | — |
| P02-a | ch-nci-mama-prevencion-pac-es-4 | 1 | True | 0.9974756766627294 | True | True | 3 | 8 | 0 |
| P02-b | ch-nci-mama-prevencion-pac-es-4 | 3 | True | 0.663271825285701 | True | True | 2 | 4 | 1 |
| P03-a | ch-pmc-prostata-eventos-cardiovasculares-nma-4 | — | — | — | — | False | 1 | 2 | 2 |
| P03-b | ch-pmc-prostata-eventos-cardiovasculares-nma-4 | — | — | — | — | True | 2 | 3 | 0 |
| P04-a | ch-pmc-mama-adn-tumoral-metastasico-rs-1 | 4 | True | 0.804147985578479 | True | True | 2 | 7 | 0 |
| P04-b | ch-pmc-mama-adn-tumoral-metastasico-rs-1 | 9 | True | 0.2305457552534759 | False | False | — | — | — |
| P05-a | ch-pmc-prostata-nueva-perspectiva-cribado-es-1 | 1 | True | 0.9967286395360945 | True | True | 2 | 7 | 1 |
| P05-b | ch-pmc-prostata-nueva-perspectiva-cribado-es-1 | 1 | True | 0.9875486402758549 | True | True | 1 | 4 | 0 |
| P06-a | ch-pmc-mama-irradiacion-pared-toracica-eca-1 | 2 | True | 0.8449634319367654 | True | True | 2 | 5 | 0 |
| P06-b | ch-pmc-mama-irradiacion-pared-toracica-eca-1 | 1 | True | 0.7366240997821127 | True | True | 2 | 4 | 0 |
| P07-a | ch-nci-prostata-hp-en-5 | 3 | True | 0.8096070240901215 | True | True | 2 | 6 | 1 |
| P07-b | ch-nci-prostata-hp-en-5 | 1 | True | 0.8604734164996981 | True | False | 2 | 6 | 1 |
| P08-a | ch-pmc-prostata-braquiterapia-focal-rs-1 | 1 | True | 0.9920804296300759 | True | True | 3 | 5 | 0 |
| P08-b | ch-pmc-prostata-braquiterapia-focal-rs-1 | 4 | True | 0.9783309793849063 | True | True | 4 | 9 | 0 |
| P09-a | ch-nci-prostata-prevencion-pac-es-4 | 1 | True | 0.9997464950947457 | True | True | 2 | 6 | 1 |
| P09-b | ch-nci-prostata-prevencion-pac-es-4 | 1 | True | 0.9998179832659614 | True | True | 1 | 4 | 0 |
| P10-a | ch-pmc-mama-elacestrant-esr1-eca-1 | 1 | True | 0.850381247410558 | True | True | 1 | 3 | 1 |
| P10-b | ch-pmc-mama-elacestrant-esr1-eca-1 | 1 | True | 0.8468878632732281 | True | True | 2 | 4 | 0 |
| P11-a | ch-pmc-mama-trastuzumab-deruxtecan-eca-1 | 1 | True | 0.9880130364216653 | True | True | 2 | 3 | 1 |
| P11-b | ch-pmc-mama-trastuzumab-deruxtecan-eca-1 | 2 | True | 0.9946281859805222 | True | True | 2 | 4 | 1 |
| P12-a | ch-pmc-prostata-niraparib-abiraterona-eca-1 | 2 | True | 0.8882933944418971 | True | True | 1 | 3 | 1 |
| P12-b | ch-pmc-prostata-niraparib-abiraterona-eca-1 | 1 | True | 0.9046376397545306 | True | True | 1 | 4 | 0 |

## p_entailment de las afirmaciones descartadas por el NLI

Descartadas: 11; entre 0.5 y 0.7: 5.

- [0.0, 0.1): 1
- [0.1, 0.2): 0
- [0.2, 0.3): 1
- [0.3, 0.4): 0
- [0.4, 0.5): 4
- [0.5, 0.6): 2
- [0.6, 0.7): 3
- [0.7, 0.8): 0
- [0.8, 0.9): 0
- [0.9, 1.0): 0

El informe no propone un valor de NLI_ENTAILMENT_THRESHOLD: cambiarlo exige una calibración con etiquetas humanas.

Muestra pequeña: el recuento por etapa orienta, no prueba.
