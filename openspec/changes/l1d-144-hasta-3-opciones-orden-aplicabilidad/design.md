# Design — l1d-144-hasta-3-opciones-orden-aplicabilidad

## Contexto

Desde `l1d-130` el pipeline ordena las opciones validadas con `applicability_order` y recorta a `maxOptions` (con 1 en S1–S3); el
excedente se omitía sin contarlo. US-134 sube el tope a 3, hace visible el orden y declara el excedente. Decidido `[S4 resp. 7]`: no se reabre.

## Decisiones

- **Secuencia fija:** validación (citas, soporte, lenguaje) → orden con el comparador → recorte a `maxOptions`. Una descartada nunca ocupa posición.
- **Orden = posición en el arreglo.** Sin campo `rank` ni puntaje (RN-28). Clave: (excluyentes en No coincide, más Coincide, `relevanceScore`, `chunkId`
  de la cita principal); la opción hereda la aplicabilidad de su fuente más aplicable (US-125).
- **`optionsNotShown`** = `len(validadas) - len(mostradas)`, calculado en `domain/` por la misma función de recorte (devuelve conservadas y excedente
  contado, nunca el contenido). Con `LLM-CUATRO`: 1; con `LLM-TRES`: 0. Las descartadas no cuentan. `rag-orchestrator` lo emite **siempre**
  (también `0`, también con `sin_evidencia`); solo en `clinical-api` es opcional, para leer los registros históricos sin el campo.
- **`ANALYSIS_MAX_OPTIONS`** (RN-22): defecto 3 desde el S4; la validación de arranque ya rechaza fuera de 1–3 (tope de FR-09, asumido); sin literales en el código.
- **`clinical-api` no reordena:** copia `evidenceOptions` y `optionsNotShown` de la respuesta interna; la respuesta 200 se construye desde lo persistido.
- **Determinismo (ADR-27):** sin `Math.random`/`uuid` ni dependencia del orden de salida del LLM; la prueba de las 24 permutaciones es de integración.

## Privacidad y ownership

- Todo el cálculo ocurre en `rag-orchestrator` con el contexto ya desidentificado (RN-11); no se añaden campos con identidad ni cruces de frontera nuevos.
- `rag-orchestrator` no accede a datos clínicos ni a `clinical-minio`; `clinical-api` es dueño de la persistencia del `AIAnalysisRecord` (RN-06).
- `optionsNotShown` es un entero: ni título, ni justificación, ni citas de la opción recortada en la respuesta, la Base, el registro ni los logs
  (log solo con conteos y `traceId`; RN-14).
- Modelos locales, sin *fallback* a la nube (RN-12). La sesión del doctor no llega a Backend 2.

## Contratos

- **Proveedores y consumidores:** `rag-orchestrator` es proveedor de `apps/rag-orchestrator/openapi.yaml` (`RagQueryInternalResponse`, línea ~944)
  y `clinical-api` su consumidor (cliente TS generado); `clinical-api` es a su vez proveedor de `apps/clinical-api/openapi.yaml` (`AnalysisBasis`,
  línea ~1541) hacia `web`. **Cada `openapi.yaml` se edita a mano como fuente** (`sync-contracts`): no se genera. `contracts/schemas/evidence.yaml`
  solo contiene los schemas compartidos (`EvidenceOption`, `SourceApplicability`, …) y **no se toca**. Después de editar y validar los dos
  `openapi.yaml` se generan desde ellos los tipos de `packages/api-contracts`, los schemas Zod y los modelos Pydantic; nunca se editan a mano.
- **Versiones (asignadas en el plan del S4):** `apps/rag-orchestrator/openapi.yaml` sube a **1.9.0** y `apps/clinical-api/openapi.yaml` a **1.14.0**.
  Cadenas por el orden real de oleadas: rag-orchestrator 291 → 109 → 295 → 144 → 300 y clinical-api 291 → 95 → 295 → 144 → 300. Este change rebasa sobre `l1d-295`
  (1.8.0 / 1.13.0, ya sobre `l1d-109`, `l1d-95` y `l1d-291`) y regenera tras su merge; `l1d-300` rebasa sobre este.
- **YAML propuesto (solo aditivo, ADR-26):**

```yaml
# apps/rag-orchestrator/openapi.yaml — info.version: 1.9.0
RagQueryInternalResponse:
  required:
    # … los existentes …
    - optionsNotShown          # siempre emitido; añadir un requerido en una respuesta no rompe al consumidor
  properties:
    optionsNotShown:
      type: integer
      minimum: 0
      description: >-
        Número de opciones validadas (con citas, soporte NLI y lenguaje válidos) que quedaron fuera de maxOptions
        tras el orden por aplicabilidad (RN-28). 0 si no hubo recorte. Solo el número: nunca título, justificación
        ni citas de las opciones recortadas. Las descartadas (discardedOptions) no cuentan. [S4 resp. 7]

# apps/clinical-api/openapi.yaml — info.version: 1.14.0
AnalysisBasis:
  # required sin cambios: ambos campos son opcionales por los AIAnalysisRecord anteriores al S4
  properties:
    optionsNotShown:
      type: integer
      minimum: 0
      description: >-
        Copiado sin transformar de RagQueryInternalResponse.optionsNotShown. Ausente solo en análisis históricos
        anteriores al S4; en los nuevos siempre presente (0 si no hubo recorte).
    maxOptions:
      type: integer
      minimum: 1
      maximum: 3
      description: ANALYSIS_MAX_OPTIONS aplicado en este análisis (RN-22, FR-09). Ausente en análisis históricos.
```

- **Ejemplos (`contracts/examples/` + `index.json`):**
  - `rag-query-request-tres-opciones.json` (spec `rag-orchestrator`, target `#/components/schemas/RagQueryInternalRequest`): `maxOptions = 3` y una
    pregunta **distinta** de la de `rag-query-request.json`, para que cada respuesta tenga su request propio.
  - `rag-query-tres-opciones.json` (spec `rag-orchestrator`, target `#/components/schemas/RagQueryInternalResponse`, `request:
    rag-query-request-tres-opciones.json`): [O-B, O-D, O-C] en el orden de FX-10c-a y `optionsNotShown = 1`. Base de los mocks `respx` y MSW hacia
    `rag-orchestrator`.
  - `con-evidencia-s4-tres-opciones.json` (spec `clinical-api`, target `#/components/schemas/EvidenceAnalysis`): la respuesta pública con
    `analysisBasis.maxOptions = 3` y `analysisBasis.optionsNotShown = 1`. Valida **solo** contra `EvidenceAnalysis`; la forma interna la cubre el ejemplo
    anterior. Base de los MSW de `web` (US-135).
  - `con-evidencia-s4-tres-opciones-no-comparable.json` (spec `clinical-api`, target `EvidenceAnalysis`): `LLM-TRES`, [O-B, O-C, O-A] con O-A
    `populationNotComparable = true` y `poblacion_no_comparable` en tercer lugar, `analysisBasis.optionsNotShown = 0`. Base del MSW de US-135 AC-5
    (`l1d-145`).
  - `rag-query-tres-opciones-no-comparable.json` (spec `rag-orchestrator`, target `RagQueryInternalResponse`, `request:
    rag-query-request-tres-opciones-no-comparable.json`, con su request propio y pregunta distinta): el mismo caso en la forma interna, con
    `optionsNotShown = 0`. Existe porque el E2E y el `visual-check` de `l1d-145` corren contra Compose con el LLM fake, que responde desde
    `contracts/examples/`.
  - **Todo** ejemplo con target `RagQueryInternalResponse` registrado en `index.json` al rebasar añade `optionsNotShown = 0` (salvo los de este
    change con otro valor), porque el campo pasa a requerido en la respuesta interna: los vigentes (`rag-query-con-evidencia.json`,
    `rag-query-sin-evidencia.json`, `rag-query-solo-descartadas.json`, `rag-query-sin-opciones.json`, `rag-query-aplicabilidad-a-m1.json`, …) y
    los que añaden antes en la cadena `l1d-291`, `l1d-295` y `l1d-297`. La tarea recorre `index.json`, no una lista fija.
- **Validación:** `contracts:check` (OpenAPI 3.1, ejemplos contra su target), `oasdiff` contra `main` sin ERR en ambos specs, `contracts:verify-provider`.

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus: no exige `run-ai-eval` en este change; la medición del orden con verdad conocida es de US-140 (M-10.1) y
la de G-5 con hasta 3 opciones, de US-141. Con TDD estricto (reglas RN-28/RN-22 y endpoints, adapters falsos).

## Riesgos / abiertos

1. **`analysisBasis.maxOptions`** (AC-1) no existe hoy en `AnalysisBasis`: se añade aditivo, poblado por `clinical-api` desde `ANALYSIS_MAX_OPTIONS`; a confirmar `[S4 resp. 11]`.
2. **Fixture FX-10c-a:** `doc-a6`/`ch-a6-1` y `LLM-CUATRO/TRES/MULTIFUENTE` aún no existen; se crean en la primera tarea (extienden FX-08b-a; `test-apl-1.0.0`).
3. Conflicto de merge con `l1d-295`/`l1d-293`/US-238 en el servicio y `respuesta_con_evidencia.py`, y con `l1d-291`/`l1d-295` en las versiones de
   los dos `openapi.yaml`.
4. **Pregunta abierta (sin resolver, para el usuario o el oncólogo asesor con DEC-11):** ¿cuenta «Parcial» en el comparador? RN-28 solo nombra
   «menos excluyentes en No coincide → más Coincide → relevancia». **Por defecto, Parcial es neutro**, como dice RN-28: no suma como Coincide ni
   resta; dos opciones que solo difieren en Parcial empatan y las desempata la relevancia. Si se decidiera otra cosa, cambia el comparador de
   US-125 y exige un MODIFIED en otro change.
5. El escenario heredado de US-125 AC-5 pasa a dar causa a `estadio` (`unknownReason = sin_regla_de_comparacion`). El motivo lo declara
   `l1d-291` en el enum, pero lo **produce** `l1d-293` (US-243, D2/D3), que además actualiza `rag-query-aplicabilidad-a-m1.json` y
   `con-evidencia-s3-aplicabilidad.json` y la aserción de US-125 AC-5: el escenario depende de `l1d-293` en `main`; si no está, espera a su merge.
