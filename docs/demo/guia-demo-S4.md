# Guía de la Demo 4 (review del S4): pares paciente + pregunta, conteos esperados y verificación

Todo con **datos sintéticos** (pacientes del seed; corpus público con licencia aceptada). Complementa `docs/demo/runbook-demo-S1.md` (preparar, levantar, apagar, fallos frecuentes) y `docs/demo/guia-demo-S3.md`. Tema del S4: **población del estudio extraída en la ingesta (ADR-47)**, **estados por criterio con listas (Coincide, Parcial, No coincide, Desconocido)** y **opciones ordenadas por aplicabilidad**.

## 0. Antes de la demo (ensayo obligatorio, 25 min)

1. `scripts/demo/apagar.sh --borrar-datos` (limpieza inicial; cierra `attu` si quedó abierto) y luego **`scripts/demo/levantar.sh`** (~15-25 min: imágenes, esquema clínico, seed, corpus, metadatos de población, pesos sparse).
   - Ollama debe correr con contexto 8192; si la app de Ollama está abierta, ciérrala (el script te lo dice).
   - Si ya hay una instalación anterior, el script **no borra nada**: lista lo que encontró y pide confirmación (`--continuar` para seguir sobre ese estado).
2. Lee la **«Verificación del seed»** que imprime `levantar.sh` antes de «Listo»: pacientes = identidades = pacientes del seed, usuarios y documentos del corpus con y sin población verificada. Todo debe decir `esperado=N obtenido=N`; un `FALLA …` detiene el script con código 1 (ver runbook §5).
3. Credenciales: `cat infra/docker/secrets/seed_doctor_password` (médico `doc1@test.local`).
4. Al terminar: `scripts/demo/apagar.sh` (cierra `attu`; un solo puerto publicado) y borra contenedores, redes y volúmenes del proyecto.

## 1. Datos de partida

| Paciente                                 | Qué muestra                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| (a) Mama HER2+ completa                  | TNM_8 IIA, ECOG 1, HER2 3+, RE positivo, posmenopáusica. Es el paciente de los dos pares.                                      |
| (e) Mama sin estado menopáusico ni Ki-67 | Criterios «Desconocido» por dato ausente en el paciente (S3).                                                                  |
| (b) Próstata ISUP 3                      | Checklist de próstata; abrir su ficha para preguntar por próstata (la recuperación filtra por el tipo de cáncer del paciente). |

Corpus de la demo (10 documentos públicos, 310 fragmentos vigentes): NCI (mama y próstata, texto libre de copyright) y PMC Open Access con CC BY. NCCN y ESMO no están incluidos (solo aparecen como «Fuentes no incluidas»).

## 2. Pares paciente + pregunta con conteos esperados

Los conteos de `applicabilitySummary` por opción salen de **este bloque** (fuente única): lo leen la prueba de aceptación (`apps/web/e2e/demo-s4-pares.spec.ts`, `[US-247 AC-2]` y `[US-247 AC-3]`) y los ejemplos fijos de `contracts/examples/rag-query-demo-s4-*.json` que sirve `LLM_PROVIDER=fake`. Cada pregunta es distinta de la pregunta insignia y de las demás.

<!-- conteos-demo-s4:inicio -->

```json
{
  "mama-her2-adyuvante": {
    "ejemplo": "mama-her2-adyuvante",
    "opciones": [
      {
        "conteos": { "coincide": 1, "parcial": 2, "noCoincide": 0, "desconocido": 3 },
        "poblacionNoComparable": false
      },
      {
        "conteos": { "coincide": 1, "parcial": 0, "noCoincide": 0, "desconocido": 5 },
        "poblacionNoComparable": false
      }
    ]
  },
  "mama-cdk46-excluyente": {
    "ejemplo": "mama-cdk46-excluyente",
    "opciones": [
      {
        "conteos": { "coincide": 1, "parcial": 2, "noCoincide": 1, "desconocido": 2 },
        "poblacionNoComparable": true
      }
    ]
  }
}
```

<!-- conteos-demo-s4:fin -->

### Par 1 · «mama-her2-adyuvante» — Coincide y Parcial

- **Paciente:** (a). **Pregunta (exacta):** _«¿Qué opciones sistémicas adyuvantes describe la evidencia del corpus de la demo para una paciente con cáncer de mama HER2 positivo, receptores hormonales positivos y estadio IIA?»_
- **Fragmentos que sustentan cada opción:**
  1. _Terapia anti-HER2 adyuvante con o sin antraciclinas_ → `pmc-mama-antraciclinas-rs` (revisión sistemática, CC BY): HER2 positivo **Coincide** (excluyente); receptores hormonales y estadio **Parcial** (lista mezclada: la revisión reúne varias poblaciones: positivo y negativo; I, II y III); línea de tratamiento, menopausia y ECOG **Desconocido** (la fuente no los reporta). Conteos 1 · 2 · 0 · 3.
  2. _Terapia endocrina adyuvante con tamoxifeno_ → `pmc-mama-tamoxifeno-eca` (ECA, CC BY): receptores hormonales positivos **Coincide**; el resto **Desconocido** (no reportado por la fuente). Conteos 1 · 0 · 0 · 5.
- **Qué mirar:** la línea «Criterios del estudio frente a datos registrados» con los cuatro conteos (sin puntaje combinado); la opción 1 va primero (empatan en criterios excluyentes en No coincide y en Coincide; la relevancia solo desempata); la leyenda del criterio de orden.

### Par 2 · «mama-cdk46-excluyente» — caso con criterio excluyente en No coincide

- **Paciente:** (a). **Pregunta (exacta):** _«¿Qué describe la evidencia del corpus de la demo sobre los inhibidores de CDK4/6 adyuvantes en una paciente con cáncer de mama HER2 positivo y receptores hormonales positivos?»_
- **Fragmento que la sustenta:** `pmc-mama-cdk46-guia` (guía, CC BY): describe CDK4/6 adyuvantes para receptores hormonales positivos y **HER2 negativo** de alto riesgo.
- **Estados:** HER2 (paciente 3+) frente a «negativo» → **No coincide** y es excluyente; receptores hormonales **Coincide**; estadio y menopausia **Parcial** (guía: varias poblaciones); línea y ECOG **Desconocido**. Conteos 1 · 2 · 1 · 2.
- **Qué mirar:** `populationNotComparable = true` y el aviso «Según los datos registrados, al menos un criterio excluyente del estudio no coincide con este paciente. La opción se muestra igualmente.» (RN-26: no se oculta ni se bloquea). En la respuesta, `warnings` contiene `poblacion_no_comparable`.
- Para el caso de **próstata**: el criterio excluyente análogo es el estado de castración (`estado_castracion`); con el paciente (b) la misma lógica marca No coincide ante una población solo resistente a la castración (si el documento lo declara).

## 3. Prueba reproducible (modo fingido, sin LLM real)

```bash
scripts/e2e/ejecutar.sh -- --grep "US-247"      # Compose de test, LLM_PROVIDER=fake, seed sintético, Playwright
```

Cada par devuelve los conteos del bloque de §2 y el par 2 trae `populationNotComparable` y `poblacion_no_comparable` `[US-247 AC-2] [US-247 AC-3]`. Es determinista: el modo fingido responde con los ejemplos de `contracts/examples/`.

## 4. Metadatos de población del corpus (US-242, AC-1)

`data/raw/seed/poblacion-verificada.json` versiona la población que extrajo US-242 (LLM local + NLI) sobre el corpus de la demo. Cada valor trae su `chunkId` (del propio documento), `scope`, `nliResult = entailment` y las versiones de prompt, modelo y catálogo; `levantar.sh` lo carga con `python -m app.scripts.poblacion_seed cargar` y reindexa el sparse (`ingest reindex-sparse`). Regenerar: ver `data/raw/seed/ATTRIBUTION.md`.

## 5. Límites honestos (decirlos antes de que pregunten)

- Los **conteos del §2 son los del modo fingido** (reproducibles). En vivo, con el LLM real, la redacción de las opciones y el número de opciones varían; los **estados por criterio** son deterministas dado lo que cita cada opción y los metadatos versionados, pero una opción distinta puede citar fragmentos distintos.
- La extracción de población se midió con una muestra humana pequeña (US-118/US-233b): los valores son **propuestos y verificados por NLI**, no una validación clínica.
- Latencia con el LLM real: la primera consulta carga el modelo (~15-25 s); `RAG_TIMEOUT_MS=90000` en el demo (runbook §4).
- El stack con el LLM local ocupa ~29 GB: cierra apps pesadas.

## 6. Si algo falla

Ver `docs/demo/runbook-demo-S1.md` §5. Apagar y limpiar al terminar: `scripts/demo/apagar.sh` (y `--borrar-datos` para empezar de cero).
