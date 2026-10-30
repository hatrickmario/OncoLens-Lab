# Tasks — l1d-293-estado-criterio-lista-poblacion

> Sin cambio de `openapi.yaml` ni de `info.version`: la sección `## contratos` solo actualiza dos ejemplos existentes al
> motivo que este change empieza a producir (ver `design.md`, Contratos). Va la primera, con su commit `contract(L1D-293)`.
> Requiere en `main` `l1d-291-poblacion-lista-contrato-migracion` (US-241: tipos de lista, `partialReason`, enum de `unknownReason` con
> `sin_regla_de_comparacion`, lector del catálogo del corpus) para `## contratos` y el cableado (3.x); las reglas puras (2.x) no lo esperan.
> Se archiva después de él.

## contratos

- [x] 0.1 Actualizar `contracts/examples/rag-query-aplicabilidad-a-m1.json` (criterio `estadio` de A-M1 × `doc-a1`, hoy ~:115) y
      `contracts/examples/con-evidencia-s3-aplicabilidad.json` (mismo criterio, hoy ~:120): `unknownReason: null` →
      `"sin_regla_de_comparacion"`; nada más cambia (`status = desconocido`, `studyPopulationValue = "I–III"`, conteos `{2,0,0,3}`).
      Validan contra el enum de `unknownReason` que añade `l1d-291` (`contracts/schemas/evidence.yaml` 1.1.0) con `contracts:check`;
      sin cambio en ningún `openapi.yaml` ni en `index.json` · test después (fixture) · commit `contract(L1D-293)`

## ai-services

- [x] 1.1 Fixture FX-08b-c: catálogo `test-apl-1.2.0` (6 criterios, sinónimos es/en, `restrictionMarkers`), pacientes A-M2 y A-M3, corpus `doc-b1…doc-b7`, `doc-b9`, `doc-b10` y `LLM-POB` en el perfil `RAG_ADAPTERS=fake` · test después (fixture)
      > Hecho en `apps/rag-orchestrator/tests/fixtures/catalogo/test-apl-1.2.0` y `tests/support/poblacion_fx08bc.py` (humo: `test_fixture_fx08bc.py`). **TRASLADADA** la copia de `test-apl-1.2.0` en `packages/clinical-catalogs/test/fixtures` (fuera del alcance de este agente) a una deuda por crear, ver D-1.
- [x] 1.2 Tests de aceptación en rojo, uno por AC: "estado_menopausico parcial con inclusiva cuando la opción cita ch-b1-1 [US-243 AC-1]", "coincide con población específica [US-243 AC-2]", "no_coincide con restricción explícita [US-243 AC-3]", "desconocido sin restricción [US-243 AC-4]", "valores_en_conflicto con ambos valores [US-243 AC-5]", "subgrupo como contexto [US-243 AC-6]", "unidad = fragmento citado [US-243 AC-7]", "tabla de casos determinista sin LLM [US-243 AC-8]" · integración (Pytest + TestClient con FX-08b-c, `@pytest.mark.ac("US-243", n)`) · TDD estricto · commit `test(L1D-293)` solo con esqueletos `raise NotImplementedError`
- [x] 1.3 Tests que fijan la causa antigua del estadio: `apps/rag-orchestrator/tests/integration/test_rag_query_aplicabilidad.py:74`
      (`[US-122 AC-1]`, hoy `("desconocido", None)`) pasa a `("desconocido", "sin_regla_de_comparacion")` en el commit `test(L1D-293)`
      con el *trailer* `Test-Removal: el AC cambia en la spec del change (MODIFIED «Desconocido sin causa cuando el dato no falta»)`;
      el test de US-125 AC-5 (`test_rag_query_herencia_aplicabilidad.py`) no fija `unknownReason` y solo **gana** la aserción
      `estadio.unknownReason == "sin_regla_de_comparacion"` (sin *trailer*: no se cambia ni se relaja ninguna aserción existente).
      Si al rebasar algún otro test o handler MSW/`respx` fija `None` para el estadio, se trata igual · TDD estricto (rojo hasta 2.5)
- [x] 2.1 Tipos en `app/domain/aplicabilidad_tipos.py` (`EstadoInterno`, `MotivoParcial`) y `valores_de_la_opcion()` por `chunkId` citado (AC-7) · TDD estricto · unitarios uno a uno
- [x] 2.2 Extraer `reconoce_restriccion()` (marcadores del catálogo) y `proyectar_estado()` (exacto, inclusivo, mezclado, rango solapado, restringido, ausente) con `partialReason` del enum de US-241 en `app/domain/applicability_rules.py` (AC-1…AC-4) · TDD estricto · unitarios uno a uno
- [x] 2.3 Extraer `detectar_conflicto()` (códigos excluyentes en fragmentos distintos) con `valores_en_conflicto` y ambos valores (AC-5) · TDD estricto
- [x] 2.4 Exclusión de `scope = subgrupo | mencion` del cómputo y del resumen, conservados como contexto (AC-6); `solo_subgrupo` de la forma antigua sigue en `parcial` durante el S4 (D6) · TDD estricto
- [x] 2.5 Tabla parametrizada de casos de la función pura (AC-8): rangos con tablas del catálogo (`rango_solapado` → `parcial`), `valor_fuera_de_tabla`, `sin_escala` y `forma_no_comparable` → `desconocido` con `unknownReason = sin_regla_de_comparacion`, sin puntaje ni porcentaje, cero llamadas al LLM · TDD estricto · commit `feat(L1D-293)`
- [x] 3.1 Cablear el cálculo por opción en `RAGOrchestratorService` y en `applicability_aggregation.py` (resumen por estado); validar la respuesta contra el spec del proveedor (US-214) · integración · requiere `l1d-291-*` · commit `feat(L1D-293)`
- [x] 3.2 Log `poblacion_conflicto` con criterio, `chunkId` y `traceId`, sin valor, texto del fragmento, prompt ni salida del LLM (RN-14, regla común l1d-291…294) · test después (integración, caplog)
- [x] 3.3 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-293)`

## evaluación

- [ ] 4.1 (pendiente: `ai-eval-runner` en el Gate 2) Si cambia el catálogo (`restrictionMarkers`, tablas de rangos), correr `run-ai-eval` y registrar la concordancia base de estados para US-233b · evaluate

## Cierre

- [x] 5.1 `openspec validate l1d-293-estado-criterio-lista-poblacion --strict`, suite de `rag-orchestrator` en verde, `contracts:check` con los dos ejemplos actualizados, `contracts:verify-provider` en verde

## Desviaciones y pendientes (ai-services-dev, 2026-10-30)

- **D-1 · Dónde viven `restrictionMarkers` y los sinónimos.** `aplicabilidad.schema.json` (`additionalProperties: false`, en `packages/clinical-catalogs`)
  no los admite y el paquete queda fuera de este agente. Se leen de un archivo opcional `<tipo>/poblacion-reglas.json` del catálogo montado
  (`infrastructure/catalogo_clinico/poblacion_reglas.py`): marcadores es/en, y por criterio `synonyms`, `scale`, `groups`; ausente = sin
  reglas, inválido = `CatalogoNoDisponible`. La fixture `test-apl-1.2.0` vive solo en el rag-orchestrator. **Falta** (clinical-platform / contratos):
  esquema y validador de `poblacion-reglas.json`, la versión `1.2.0` real en ambos backends y su copia exacta (`test_fixtures_de_aplicabilidad`).
- **D-2 · Unidad de la `applicability` de la fuente.** El contrato solo trae criterios por fuente, no por opción: `applicability[]` se calcula con la unión de
  los fragmentos que citan las opciones mostradas (sin cita, el mejor chunk) y el resumen **por opción** (`perSource`, `applicabilitySummary`) con los
  de esa opción. Dos opciones del mismo documento (AC-7) se distinguen en el resumen de cada opción, no en `criteria`.
- **D-3 · P6 (`value` > 200 caracteres)** sigue abierta (US-241): la respuesta no emite `studyPopulationValues` con valores más largos que el contrato
  en lugar de tumbar el análisis; el estado sí los usa.
- **D-4 · `data/evaluation/aplicabilidad/pares.yaml`:** el estadio de A-M1 × doc-a1 pasa a esperar `sin_regla_de_comparacion` (MODIFIED de la spec).
- **D-5 · El camino textual (US-123)** ya no pregunta al LLM por un criterio cuya lista trae solo subgrupo o mención.
