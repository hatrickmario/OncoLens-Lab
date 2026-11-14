# Design — l1d-331-composicion-terminos-prostata

## Context

Ver `proposal.md` y ADR-52. `terminos_del_caso` compone, en orden, tipo, estadio (y grado) y biomarcador principal. En
próstata el principal es PSA y arrastra la recuperación a cribado.

## Decisions

1. **Opción elegida: lista declarativa de biomarcadores no anclables por tipo en el catálogo** (frente a un orden propio
   de preferencia de la expansión, que duplicaría `datos-criticos`, o a quitar el campo `biomarcador_principal` en
   próstata por configuración, que también descartaría HRR). Es la corrección mínima: un dato del catálogo, cero código
   clínico en el dominio, mama intacta (sin entrada).
2. **Dónde vive.** `lenguaje/marcos-de-pregunta.json` -> `expansion.biomarcadoresNoAnclables.<tipo>: [nombre normalizado]`
   (misma normalización que el resto de ese archivo). Es un archivo que solo lee `rag-orchestrator` y los validadores; no
   toca `datos-criticos.json`, que consumen `web` y `clinical-api`. Sección opcional: su ausencia equivale a vacío.
3. **Dominio.** `CatalogoDeTerminos.biomarcadores_no_anclables: Mapping[tipo, frozenset[str]]` (por defecto vacío);
   `_del_biomarcador_principal` ignora esos nombres. Sin término PSA (ni valor) en la consulta; el grado ISUP y el estadio
   permanecen.
4. **Meta de AC-1.** Se fija con la medición de la corrida final (D6-50): objetivo inicial, bajar de 54/66 a ≤ 33/66
   (menos de la mitad); si la medición real no lo alcanza se documenta y se decide en D6-42. Durante el desarrollo solo se
   demuestra con adapters falsos que PSA ya no entra y que la consulta contextual cambia.
5. **Versiones.** manifest 1.9.0, `marcos-de-pregunta` 1.8.0 (tocado), barrido de 1.8.0 en ejemplos y tests como L1D-329.

## Riesgos

El siguiente biomarcador (HRR) podría anclar otro sesgo: se mide en D6-50. RN-27/RN-11: los términos siguen saliendo solo
del catálogo; la lista contiene nombres de catálogo, nunca datos del caso.
