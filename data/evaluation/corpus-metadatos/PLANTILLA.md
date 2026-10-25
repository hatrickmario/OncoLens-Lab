# Plantilla de revisión de metadatos extraídos del corpus (US-118, TBD-20, M-08.4)

Cada `<release>.yaml` de esta carpeta lo escribe `python -m app.scripts.ingest` al publicar una `CorpusRelease`. Contiene
una **muestra reproducible** (`CORPUS_METADATA_SAMPLE_PCT` de los documentos `extraido_verificado`, elegidos con
`CORPUS_METADATA_SAMPLE_SEED`) y todos sus campos en `revision: pendiente`. La revisión es **humana**: ninguna herramienta
marca un campo como correcto o incorrecto. La lee US-132 (AC-4) para calcular la exactitud de los metadatos extraídos
(M-08.4). Solo corpus público: ningún dato de pacientes.

## Cómo revisar (unos 20 minutos por muestra)

1. Abre `<release>.yaml` y, por cada documento de `documentos`, abre su `source_url` (si dice `no_disponible`, busca el
   documento por `source_name` y `external_id`).
2. Para cada elemento de `campos`, compara `valor` con lo que **la fuente declara de forma explícita**. Cambia `revision`
   a `correcto` o `incorrecto`. Si hay duda, escribe `incorrecto` y explica en `nota`.
3. No edites `campo` ni `valor`: si el valor es inexacto, la respuesta es `incorrecto` (la nota puede traer el valor
   correcto). No cambies la selección de documentos.
4. Guarda el archivo y avisa para versionarlo (la ruta y la revisión quedan en el PR de la historia).

## Qué cuenta como `correcto`, por campo

| `campo` | Es `correcto` cuando la fuente… | Es `incorrecto` cuando… |
|---|---|---|
| `study_design` | describe ese diseño: `eca` (asignación aleatoria), `observacional`, `revision_sistematica`, `guia` | el diseño real es otro, o la fuente no permite afirmarlo |
| `trial_phase` | declara esa fase (`I`, `II`, `III`, `IV`) del ensayo | la fase es otra, o el documento no es un ensayo |
| `sample_size` | declara ese número de participantes analizados o incluidos | el número es otro, o corresponde a otra cohorte o a un subgrupo |
| `primary_endpoint` | nombra ese criterio como el principal | es un criterio secundario, exploratorio o no aparece |
| `subtipo` | describe ese subtipo para la población del estudio | es de otra población o de un subgrupo |
| `estadio` | declara ese estadio o rango de estadios como criterio de la población | es otro, o solo aplica a un subgrupo |
| `linea` | declara esa línea de tratamiento del estudio | es otra o no se declara |
| `edad` | declara ese criterio de edad de la población | es otro |
| `ecog` | declara ese estado funcional ECOG como criterio de la población | es otro |
| `biomarcadores.her2`, `biomarcadores.receptores_hormonales`, `biomarcadores.hrr_brca` | declara ese estado del biomarcador para la población del estudio | el estado es otro o solo aplica a un subgrupo |

Regla general: se revisa **lo que el documento declara**, no si el dato es clínicamente deseable. Un valor correcto pero
de un subgrupo (no de toda la población) es `incorrecto`: la representación de subgrupos queda fuera del S3.

## Límite conocido: lo declarado por el manifiesto también aparece

La muestra se construye desde las filas `extraido_verificado` del catálogo, y la fila no distingue un valor que el LLM
extrajo (y el NLI verificó) de uno que el manifiesto ya declaraba (p. ej. un `study_design` publicado por la fuente).
Si revisas un campo cuyo valor viene claramente del encabezado o de los metadatos de la fuente y no del texto, márcalo igual
(`correcto`/`incorrecto`) y escribe en `nota`: `declarado por la fuente`. Mientras no exista la columna `extracted_fields`
(deuda en `tasks.md`), M-08.4 puede salir inflado por esos campos.

## Formato del archivo

```yaml
release: release-…            # id de la CorpusRelease que publicó la ingesta
prompt_version: metadatos_v1
llm_model: …                  # LLM local usado (ADR-39)
nli_model: …                  # modelo NLI usado para verificar
seed: …                       # CORPUS_METADATA_SAMPLE_SEED
pct: 10.0                     # CORPUS_METADATA_SAMPLE_PCT
generated_at: "…"             # instante de la ingesta
documentos:
  - document_id: i-lit-1@…
    source_name: PMC Open Access
    external_id: …
    source_url: https://…     # o no_disponible
    campos:
      - campo: trial_phase
        valor: "III"
        revision: pendiente   # → correcto | incorrecto
        nota: ""
```

`revision` admite solo `pendiente`, `correcto` o `incorrecto`.
