# Design — l1d-305-rn23-voz-propia-nivel-b

## Contexto

El filtro de producción de RN-23 (`app/domain/support.py`, `coincidencias_en_campo_generado`) aplica solo el nivel A de
`terminos-prohibidos.json` (1.5.0) sobre `CAMPOS_GENERADOS`. El nivel B (prefijos `recomend`/`recomiend`/`recommend` y verbos
de acción) solo se aplica a textos propios (lint de UI y de contratos) y a la medición de `evaluate`. La corrida de L1D-298
con el generador real dejó `salida_mostrada_nivel_b = 1` (regla `b-recommend` en `rationale`) y las formas españolas en voz
propia («Se recomendaría», «Se aconseja», «Considere iniciar») sin cubrir (deuda D4-01, decidida por el usuario el
2026-10-31: A+B bloqueante).

## Decisiones

### 1 · Voz propia: términos nuevos del nivel A (AC-1, AC-3)

La lista pasa a **1.6.0** y el nivel A recibe, con `formas` y `excepciones` del mecanismo de `[S1 resp. 33]`:

| Forma | Términos (id propuesto) | Variantes cubiertas por `formas` |
|---|---|---|
| Condicional | `es-se-recomendaria` | se recomendaría(n), no se recomendaría |
| Impersonal con «se» | `es-se-aconseja` | se aconseja(n), se aconsejaría(n), no se aconseja |
| Imperativo | `es-considere-iniciar` | considere(n) iniciar/administrar/suspender, considérese, no considere |
| Condicional de sugerencia | `es-se-sugeriria` | se sugeriría(n), no se sugeriría |

La clave flexiva ya cubre número y género; la negación entra por la secuencia («no» delante no anula la coincidencia). Las
`excepciones` cubren usos descriptivos conocidos («los autores consideran iniciar…», «se aconseja en la guía X» **no** es
excepción: es atribución, la cubre la decisión 2). Los ids finales los fija la tarea 1.1; el test estructural de `[S1 resp. 33]`
(ids únicos entre niveles) sigue vigente.

*Descartadas:* una lista local en `rag-orchestrator` (dos dueños de RN-23) y ampliar `modales_normativos.py` (esos van a la
regla de forma D-a, no a `lenguaje_no_permitido`, y AC-1 exige `lenguaje_no_permitido`).

### 2 · Recomendación atribuida: subconjunto del nivel B para la salida generada (AC-2)

La lista declara una sección nueva, validada en los dos cargadores:

```json
"salidaGenerada": { "nivelB": ["b-recomend", "b-recomiend", "b-recommend"] }
```

- Cada id MUST existir en `nivelB`; un id desconocido hace fallar la carga (falla cerrada, como el resto de la lista).
- El filtro de producción aplica a cada campo de `CAMPOS_GENERADOS` el nivel A **más** ese subconjunto. Una coincidencia del
  subconjunto se trata igual que una del nivel A: retiro con el literal, `lenguaje_no_permitido` y, si está en la
  justificación, la opción a `discardedOptions`.
- **Cita textual permitida solo si va atribuida** (AC-2, Decidido, usuario, 2026-11-03, `[S5 resp. 11e]`): un tramo entre
  comillas (`«…»`, `"…"`, `“…”`) precedido de «Según ‹fuente›:» (‹fuente› = título del catálogo del fragmento, RN-25), cuyo
  texto normalizado aparece literalmente en el `chunkTextSnapshot` de un fragmento que **la misma opción cita** (enlace al
  fragmento por su `chunkId` en las citas), se tapa antes de buscar el subconjunto B (no el nivel A: una cita no habilita
  «debe recibir»). Comillas sin atribución o sin coincidencia literal no tapan nada: la cita sin atribución se rechaza. Regla pura con nombre propio: `tapar_citas_textuales_del_corpus()` en
  `app/domain/lenguaje.py`, con su gemelo en TypeScript **solo si** algún consumidor Node lo necesita (hoy ninguno: YAGNI).
- El resto del nivel B (`iniciar`, `administrar`, `standard of care`…) **no** se aplica a la salida generada (AC-5).

Alternativa elegida frente a: (b) mover los prefijos `recomend*` al nivel A (rompería el escenario vigente «La raíz recomend
solo se aplica cuando se pide el Nivel B» y el lint de UI cambiaría de nivel) y (c) una constante de ids en el dominio de
`rag-orchestrator` (la política dejaría de vivir en el catálogo versionado). Barato de revertir: un campo del JSON.

### 3 · Dónde vive la política (un solo dueño)

`ListaTerminos` (Pydantic) y `loadProhibitedTerms` (Zod) leen `salidaGenerada`; `support.py` obtiene los niveles a aplicar
de un método con nombre `reglas_para_salida_generada()` de la lista, no de un literal en el filtro. `check_prohibited_terms`
recibe un parámetro `solo_ids_b` (o equivalente) para limitar el nivel B; su firma pública en Node se amplía igual para
conservar la paridad, sin cambiar su valor por defecto (solo nivel A).

### 4 · Medición (AC-4, AC-5)

- `scripts/eval/comparar-baseline.mjs`: `terminos_prohibidos.salida_mostrada_nivel_b` pasa de `informativa` a
  `bloqueante`; `esquema_suite.py` y el docstring de `metricas/prescriptivas.py` dejan de llamarlo «seguimiento».
- Corrección del filtro: el reporte ya anota la propuesta cruda por nivel; se añade `corregidas_por_el_filtro` (propuestas
  crudas con término A o B que no aparecen en lo mostrado), solo conteos e ids de regla (RN-14).
- Falsos positivos (AC-5): `rechazos_legitimos` = salidas del set marcadas `legitima: true` (describen lo que dice la evidencia
  sin dirigirse al paciente) que el filtro rechaza; se mide con la lista **1.5.0** (copia fija en
  `data/eval/fx-rn23/linea-base/terminos-prohibidos-1.5.0.json`, línea base de US-068) y con la **1.6.0** sobre las mismas
  propuestas. Falla si `rechazos_legitimos(1.6.0) − rechazos_legitimos(1.5.0) > rn23_tolerancia_falsos_positivos`, clave de la
  configuración de la suite (RN-22; valor `0`, Decidido, usuario, 2026-11-03, registrado en el reporte).

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` | 1.6.0: términos A y `salidaGenerada` | — (datos) |
| `packages/clinical-language/src/load-prohibited-terms.ts`, `tipos.ts`, `check-prohibited-terms.ts` | Esquema y opción de subconjunto B | lista |
| `apps/rag-orchestrator/app/domain/lenguaje.py` | `ListaTerminos.salida_generada`, `reglas_para_salida_generada()`, `tapar_citas_textuales_del_corpus()` | lista |
| `apps/rag-orchestrator/app/domain/support.py` | `coincidencias_en_campo_generado` usa las reglas de la lista y los textos de los fragmentos citados | `lenguaje.py`; puerto `BuscadorDeTerminos` (sin cliente concreto) |
| `ProhibitedTermsChecker` (cableado en `app/bootstrap.py` y `app/evaluation/composicion_suite.py`) | Pasa los textos de los fragmentos citados al dominio; producción y suite usan la misma instancia de política | `lenguaje.py` |
| `app/evaluation/metricas/prescriptivas.py`, `esquema_suite.py`, `scripts/eval/comparar-baseline.mjs` | A+B bloqueante, `corregidas_por_el_filtro`, `rechazos_legitimos` | dominio |
| `data/eval/fx-rn23/*`, `eval/configs/rn23-fake.yaml`, `eval/configs/local.yaml` | Casos nuevos, línea base 1.5.0, tolerancia | — |

**Fakes tocados:** el generador falso de guion (`fake-guion@1`, `propuestas.yaml` de `fx-rn23`) recibe propuestas nuevas; su
test de contrato sigue en `tests/evaluation/modelos_falsos.py` y su suite (mismos errores y `null` ≠ `0.0` que el adapter
real). No se toca ningún otro fake.

## Privacidad y ownership

- Ningún dato cruza una frontera nueva: el filtro corre dentro de `rag-orchestrator` sobre la salida del LLM local y los
  `chunkTextSnapshot` del corpus recuperado en esa consulta. `rag-orchestrator` sigue sin tocar datos clínicos ni
  `clinical-minio`; la lista se monta de solo lectura (`CLINICAL_CATALOG_PATH`).
- RN-11 no cambia: el contexto que llega ya va desidentificado.
- Logs: el evento `fragmento_retirado_lenguaje` registra `ruleId` y `languagePolicyVersion` (1.6.0), nunca el texto
  retirado, la cita ni el término (`[S1 resp. 29]`, RN-10).
- Reportes de `evaluate`: solo conteos, ids de caso e ids de regla (RN-14); `fx-rn23` es sintético y no contiene NCCN ni ESMO
  (RN-21).
- RN-12: la corrida con el generador real usa solo `proveedor: local` y las guardas de `es_proveedor_local()`.

## Contratos

**Sin diff** en `apps/rag-orchestrator/openapi.yaml`, `apps/clinical-api/openapi.yaml` ni `contracts/examples/`
(contract-first, ADR-26). `discardReason = lenguaje_no_permitido`, `unsupportedClaims` y el literal de retiro ya existen.
Efecto indirecto: `contracts:check` aplica la lista a descripciones y ejemplos; con 1.6.0 debe seguir en verde (tarea 1.4). Si
un ejemplo coincidiera con un término nuevo, se corrige el ejemplo en un commit `contract(L1D-305)` antes que el código. Sin
cambio incompatible (oasdiff vacío).

## Evaluación

Toca el **catálogo de lenguaje** y la política del filtro: OL-06 obligatoria.

| Métrica | Meta | Dónde se mide |
|---|---|---|
| `terminos_prohibidos.salida_mostrada_nivel_a` y `_nivel_b` (M-10.2) | 0, **ambas bloqueantes** | CI (`rn23-fake`, `test-fake`) y corrida nocturna del día 2 con `proveedor: local` |
| `propuesta_cruda` por nivel y `corregidas_por_el_filtro` | Se anotan | ídem |
| `rechazos_legitimos` 1.6.0 frente a 1.5.0 | Diferencia ≤ `rn23_tolerancia_falsos_positivos` | ídem |
| Fidelidad, precisión de citas, «sin evidencia» | Sin regresión frente al baseline | CI con fakes; con modelos locales en la corrida nocturna |

AC-4 con el generador real **no** corre en la CI ni en horario de trabajo: entra en la corrida nocturna única del cierre del
día 2 (`S5-refinamiento.md` §5) y su informe lo escribe `ai-eval-runner` en `reports/eval/` (permiso D5-03).

## Riesgos

- **Falsos positivos** del subconjunto B en `rationale` («Los autores recomiendan…» como hallazgo del estudio): es justamente
  lo que AC-2 decide rechazar salvo cita textual atribuida; AC-5 vigila que no crezcan los rechazos de salidas legítimas.
- **Lint de UI y contratos:** los términos nuevos del nivel A también aplican a textos propios; si `lint:lenguaje` o
  `contracts:check` encuentran una colisión, se corrige el texto, nunca la lista.
