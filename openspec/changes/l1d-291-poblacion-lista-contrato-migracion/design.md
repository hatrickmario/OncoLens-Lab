# Design — l1d-291-poblacion-lista-contrato-migracion

## Context

En `main`: `ApplicabilityCriterion` (contrato `contracts/schemas/evidence.yaml`, `info.version` 1.0.0) lleva
`studyPopulationValue` (`string | null`, obligatorio) y `unknownReason ∈ {falta_en_paciente, no_reportado_por_fuente,
null}`; `SourceApplicability.populationNotComparable` ya existe. `corpus.corpus_document.population_criteria` es JSONB
con una clave por `studyKey` (valor escalar o `{valor, alcance}`, o `no_disponible`); la última migración es
`0004_extracted_fields`. ADR-47 (aceptado) fija la extracción en abanico y la lista acotada por fragmento. Decisiones del
usuario del 2026-10-29: cambio aditivo, retiro del campo viejo en el S5 `[S4 resp. 5]`; `partialReason` y campos
opcionales `[S4 resp. 11]`; tope 3 por fragmento y criterio, la respuesta une los de los fragmentos citados
`[S4 resp. 13]`.

## Goals / Non-Goals

- Goals: forma contract-first sin incompatibilidades; migración reversible; lector de las dos formas; frontera de
  `rag_corpus` intacta.
- Non-Goals: llenar la lista, calcular estados, UI, retirar lo deprecado.

## Decisions

- **D1 Contract-first.** Se edita `contracts/schemas/evidence.yaml`, luego `sync-contracts` (openapi de ambos
  backends, cliente TS, Pydantic, Zod) y ejemplos en el mismo PR; `contracts:check` y `oasdiff` sin ERR.
- **D2 Campos opcionales y nulables.** `studyPopulationValues` y `partialReason` fuera de `required` (excepción
  nombrada a la regla de bloques obligatorios, con dueño en este design); el schema sigue cerrado. Verificar que
  los clientes generados (TS, Zod, Pydantic) los aceptan y los conservan.
- **D3 Tope por fragmento y criterio; sin `maxItems` en la respuesta.** `POPULATION_MAX_VALUES_PER_CRITERION`
  (configuración, valor inicial 3, RN-22) rige **por fragmento y criterio** al extraer y persistir (ADR-47). La
  respuesta une los valores de todos los fragmentos citados por la opción, sin `maxItems`. Ni el lector ni el dominio
  usan el literal `3`: leen la clave de configuración.
- **D4 Forma persistida.** Por criterio, lista de `{value, chunkId, scope, promptVersion, modelVersion,
  catalogVersion, nliResult}`; sigue siendo JSONB (sin cambiar tipo de columna). La migración `0005` no reescribe las
  filas antiguas (P1): añade el soporte de la forma nueva y el lector doble las proyecta; `downgrade -1` revierte. Se
  aplica con `rag_corpus_migrator`; solo schema `corpus`.
- **D5 Marca `pendiente` por criterio.** Un criterio cuya extracción falló tras el reintento (US-242) se guarda dentro
  de `population_criteria` como `{"status": "pendiente", "values": []}`. Es una forma válida: el lector la acepta, la
  entrega al dominio como criterio pendiente con lista vacía y **no** registra `poblacion_forma_invalida`. La escribe
  US-242 y la lee el respaldo de US-244 (por criterio; `metadata_source` es por documento y no sirve para esto).
- **D6 Lector doble en el repositorio.** El puerto de dominio devuelve siempre, por criterio, una lista de valores más
  la marca de pendiente; la forma antigua se proyecta como lista de un elemento con `scope = elegibilidad` y
  `chunkId = null` (P2). Forma inválida (más de `POPULATION_MAX_VALUES_PER_CRITERION` valores de un mismo
  `(criterio, chunkId)`, `scope` fuera del enum) → criterio `desconocido`, `no_reportado_por_fuente`, `200`, log
  `poblacion_forma_invalida` con criterio, `chunkId` y `traceId` (RN-14, RN-26).
- **D7 `clinical-api` no reinterpreta.** Valida con el cliente generado y persiste el JSON tal cual llegó (RN-06);
  los análisis históricos conservan la forma antigua.
- **D8 Versiones (asignadas por la sesión principal).** `apps/rag-orchestrator/openapi.yaml` 1.5.0 → **1.6.0**,
  `apps/clinical-api/openapi.yaml` 1.10.0 → **1.11.0** y `contracts/schemas/evidence.yaml` 1.0.0 → **1.1.0**. Si otro
  change del S4 sube el mismo número, quien mergea segundo rebasa (regla de `api-contracts`). Es el primer eslabón de
  las cadenas del S4 (rag-orchestrator 291 → 109 → 295 → 144 → 300; clinical-api 291 → 95 → 295 → 144 → 300): rebasa
  sobre `main`; `l1d-109` y `l1d-95` rebasan sobre él.
- **D9 `unknownReason` y su productor en el S4.** Se añaden `varios_valores_en_la_fuente`, `valores_en_conflicto`,
  `respaldo_fallido` (ADR-47) y `sin_regla_de_comparacion` (aditivo; lo emite US-243 para `valor_fuera_de_tabla`,
  `sin_escala` y `forma_no_comparable`; el texto visible, «? Desconocido · el catálogo no define cómo comparar este
  criterio», lo define `l1d-131`). `varios_valores_en_la_fuente` queda **reservado**: está en el enum por ADR-47, pero
  ningún change del S4 lo produce; no se quita.
- **D10 `studyPopulationValue` (deprecado, aún obligatorio).** Con lista: el **primer** valor con
  `scope = elegibilidad` de los fragmentos citados (en el orden de las citas de la opción); si no hay ninguno, `null`.
  Con forma antigua: su texto, como hoy. Se elige `null` y no «No disponible» porque el schema vigente es
  `string | null` y el texto «No disponible» lo pone la UI (RN-25); así el campo no inventa un literal.
- **D11 Filtro RN-23.** `studyPopulationValues[].value` se suma a `camposGenerados` de
  `packages/clinical-language/origen-de-campos.json`, igual que hoy `studyPopulationValue`, para que el recorrido de
  términos prescriptivos lo incluya.

## Dependencias y colaboradores

- Depende de US-118/l1d-117 (`population_criteria`, claves `studyKey`) y de ADR-47/DEC-11.
- Crea: migración `0005` en `app/infrastructure/catalog/alembic/versions/`, ejemplos
  `con-evidencia-s4-poblacion-lista.json` (`EvidenceAnalysis`, `clinical-api`),
  `rag-query-poblacion-lista.json` (`RagQueryInternalResponse`, `rag-orchestrator`) y su petición
  `rag-query-request-poblacion-lista.json` (pregunta distinta de las existentes), fixtures `doc-a1`/`doc-b1` de FX-08b-c.
- Modifica: `contracts/schemas/evidence.yaml`, ambos `openapi.yaml`, `contracts/examples/index.json`,
  `packages/api-contracts`, `packages/clinical-language/origen-de-campos.json`,
  `app/infrastructure/catalog/{tables,catalogo_reader}.py`, `app/domain/aplicabilidad_tipos.py`,
  `app/application/aplicabilidad.py` (solo para consumir la lista; sin reglas nuevas),
  `docs/architecture/data-model.md` §4.6, configuración `POPULATION_MAX_VALUES_PER_CRITERION`, módulo
  `evidence-analysis` de `clinical-api` (validación/persistencia).
- Consumidores: `l1d-292-poblacion-abanico-ingesta` (escribe la lista y la marca `pendiente`),
  `l1d-293-estado-criterio-lista-poblacion` (`partialReason`, `sin_regla_de_comparacion`),
  `l1d-294-respaldo-poblacion-consulta` (lee la marca `pendiente`, emite `respaldo_fallido`), US-126 y US-245; si
  US-245 comparte PR de contrato, coordinar `info.version`.

## Privacidad y ownership

Sin datos clínicos: corpus público y fixtures sintéticos. La migración corre como `rag_corpus_migrator` y solo toca
`corpus`; `rag-orchestrator` no gana acceso a `auth`, `identity`, `clinical`, `audit` ni `research` (RN-10, SEG-06,
AC-T4.4). Valores de población extraídos por IA de fragmentos públicos citados y verificados con NLI contra
ellos (ADR-47); los metadatos de la fuente salen del catálogo (RN-25).

**Regla de logs del pipeline de población (común a l1d-291…294):** se permite el `chunkId` (ID del corpus público),
el criterio, contadores, longitudes, `finish_reason` y `traceId`; **nunca** el valor, el texto del fragmento, el
prompt ni la salida del LLM (RN-14). `poblacion_forma_invalida` lleva criterio, `chunkId` y `traceId`.

## Contratos

Cambio aditivo (ADR-26): primera tarea de `## contratos` con `sync-contracts`. Los cuatro valores nuevos de
`unknownReason` los marca oasdiff como ERR (`response-property-enum-value-added`); se declaran como excepciones
E-6…E-13 de ADR-26 (una por valor y proveedor). Decidido (usuario, 2026-10-30). `oasdiff` sin cambio incompatible;
`studyPopulationValue` `deprecated: true` hasta el S5. Verificación del proveedor en los tests de integración (US-214).

Diff propuesto de `contracts/schemas/evidence.yaml` (1.0.0 → 1.1.0):

```yaml
    ApplicabilityCriterion:
      # required: sin cambios (studyPopulationValue sigue obligatorio; los campos nuevos son opcionales)
      properties:
        studyPopulationValue:
          type: [string, "null"]
          deprecated: true
          description: >-
            Deprecado; se retira en el S5 (ADR-26). Con lista, el primer valor con scope elegibilidad de los
            fragmentos citados por la opción; si no hay ninguno, null. Con la forma antigua, su texto.
        studyPopulationValues:
          type: array
          description: >-
            Valores de población de los fragmentos que cita la opción (ADR-47). El tope
            POPULATION_MAX_VALUES_PER_CRITERION rige por fragmento y criterio al extraer; aquí no hay maxItems.
          items:
            $ref: '#/components/schemas/StudyPopulationValue'
        partialReason:
          type: [string, "null"]
          enum: [inclusiva, mezclada, rango_solapado, solo_subgrupo, null]
        unknownReason:
          type: [string, "null"]
          enum:
            - falta_en_paciente
            - no_reportado_por_fuente
            - varios_valores_en_la_fuente   # reservado: sin productor en el S4
            - valores_en_conflicto
            - respaldo_fallido
            - sin_regla_de_comparacion
            - null
    StudyPopulationValue:
      type: object
      additionalProperties: false
      required: [value, chunkId, scope]
      properties:
        value:
          type: string
          maxLength: 200
          description: >-
            Extraído por IA de un fragmento citado y verificado con NLI contra él (ADR-47); no es texto
            copiado del corpus; recorrido por el filtro RN-23.
        chunkId:
          type: string
        scope:
          type: string
          enum: [elegibilidad, subgrupo, mencion]
```

Ejemplos: `con-evidencia-s4-poblacion-lista.json` (`clinical-api`, `EvidenceAnalysis`) y
`rag-query-poblacion-lista.json` (`rag-orchestrator`, `RagQueryInternalResponse`, con `request`
`rag-query-request-poblacion-lista.json`), ambos registrados en `index.json`. El segundo alimenta el MSW de
`clinical-api` (US-213). En los dos, un criterio con `studyPopulationValues` de dos elegibilidades lleva
`studyPopulationValue` = la primera; otro con solo un valor `subgrupo` lleva `studyPopulationValue = null`. Los
ejemplos con la forma antigua (`con-evidencia-s3-aplicabilidad.json`, `rag-query-aplicabilidad-a-m1.json`) siguen sin los
campos nuevos y este change no los toca; `l1d-293`, productor de `sin_regla_de_comparacion`, cambia en ellos el
`unknownReason` del `estadio` de A-M1 × `doc-a1` (`null` → `sin_regla_de_comparacion`) en su propia sección `## contratos`.

## Evaluación

No cambia modelo, prompt, umbral ni corpus ingerido (solo forma y lector). La suite `evaluate` no se mueve;
`run-ai-eval` en el PR confirma que A-M1 × `doc-a1` no cambia. La calidad de la extracción es de US-242/US-233b.

## Risks / Trade-offs

- [Campos nuevos opcionales rompen un consumidor generado estricto] → test de AC-2 con ambos ejemplos.
- [Otra migración `0005` del schema `corpus` en paralelo] → renumerar al rebasar; `alembic heads` con una sola cabeza.
- [Conversión de la forma antigua pierde matiz de `alcance`] → el lector doble evita reescribir datos (P1).

## Pendientes de definir

- **P1 · ¿La migración 0005 reescribe las filas antiguas o solo añade el soporte de la forma nueva?** (dueño: humano;
  afecta: AC-3). El AC pide que "no se borren ni pierdan su valor" y a la vez que `doc-a1` siga en forma antigua
  (FX-08b-c, AC-4). Propuesta adoptada en D4: la migración no reescribe datos (valida/añade restricciones y versión de
  forma) y el lector proyecta la antigua; `downgrade` trivial.
- **P2 · `scope` y `chunkId` de la forma antigua** (dueño: humano; afecta: AC-4). Propuesta: `scope = elegibilidad`,
  `chunkId = null` en la proyección, `nliResult` ausente; el contrato exige `chunkId` string, así que la antigua nunca
  se emite en `studyPopulationValues` (solo en el campo deprecado).
- **P3 · Resuelto:** el tope se valida al leer por `(criterio, chunkId)` contra `POPULATION_MAX_VALUES_PER_CRITERION`
  (D3, D6); la unión de la respuesta no tiene tope.
- **P4 · `population_form`: ¿informativa o debe usarse?** (a confirmar por el usuario; afecta: AC-3). Hoy la escribirá US-242 y
  el lector la ignora (detecta la forma por criterio). Si debe usarse, el lector la leerá para elegir la forma de la fila.
- **P5 · ¿El lector acepta `{"values": […]}` sin `status`?** (a confirmar por el usuario; afecta: AC-4). Hoy sí, como lista.
- **P6 · `value` de más de 200 caracteres.** (a confirmar por el usuario; decidir en l1d-293 o l1d-292). El contrato lo rechaza
  (`maxLength` 200) y tumbaría el análisis si el lector lo deja pasar; hoy el lector no lo valida.
