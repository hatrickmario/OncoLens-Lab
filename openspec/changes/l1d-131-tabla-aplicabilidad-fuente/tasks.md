# Tasks — l1d-131-tabla-aplicabilidad-fuente

> Sin cambio de `openapi.yaml` ni de `info.version` (ver `design.md`, Contratos): la sección `## contratos` va la primera y solo crea
> ejemplos `EvidenceAnalysis` para los tests de UI. ⛔ Requiere el cliente TS regenerado y el enum de `l1d-291` (US-241) para
> `## contratos`, y el cálculo de `l1d-293` (US-243) para el E2E de AC-8…AC-10; los componentes se prueban antes con MSW desde
> `contracts/examples/`. Test del AC primero (UI): commit `test(L1D-131)` en rojo antes de `feat(L1D-131)`; `visual-check` al final.

## contratos

- [x] 0.1 Crear `contracts/examples/con-evidencia-s4-poblacion-a-m2.json` (spec `clinical-api`, target
      `#/components/schemas/EvidenceAnalysis`; sintético, A-M2, forma de lista de `l1d-291`, vocabulario no prescriptivo, aviso de IA
      y una pregunta propia) con O-P1 (`estado_menopausico` Parcial `partialReason = inclusiva`, `doc-b1`, y un criterio con
      `unknownReason = respaldo_fallido`), O-P5 (Parcial `mezclada`, `doc-b5`) y O-P6 (`receptores_hormonales` Desconocido
      `no_reportado_por_fuente` con solo un valor `scope = subgrupo`, como contexto). Como `evidenceOptions` tiene `maxItems: 3`, los
      demás casos van en `contracts/examples/con-evidencia-s4-poblacion-a-m2-b.json` (mismo target): O-P4 (`estado_her2`
      Desconocido `valores_en_conflicto` con `ch-b4-1` y `ch-b4-2`), O-P10 (`estado_menopausico` con 4 valores de elegibilidad en
      `ch-b10-1`/`ch-b10-2`, para «ver más») y un criterio Desconocido con `unknownReason = sin_regla_de_comparacion`. Ambos
      registrados en `index.json`; `contracts:check` en verde (enum de `contracts/schemas/evidence.yaml` 1.1.0, filtro RN-23 sobre
      `studyPopulationValues[].value`) · test después (fixture) · commit `contract(L1D-131)`

## clinical-platform

- [ ] 1.1 TRASLADADA a 2.9 (pendiente de decisión del orquestador; ver nota) · Perfil de test E2E: `RAG_ADAPTERS=fake`, catálogo `test-apl-1.2.0` montado en ambos backends y seed de A-M1/A-M2 con FX-08b-a y FX-08b-c · test después (fixture)
- [x] 1.2 Handlers MSW de `apps/web/tests/support/msw/` construidos desde `contracts/examples/`: `con-evidencia-s4-poblacion-a-m2.json` y
      `con-evidencia-s4-poblacion-a-m2-b.json` (0.1: conflicto, Parcial inclusiva y mezclada, subgrupo, 4 valores, `respaldo_fallido`,
      `sin_regla_de_comparacion`), `con-evidencia-s4-poblacion-lista.json` (`l1d-291`), `con-evidencia-s3-aplicabilidad.json` (A-M1,
      forma antigua) y `con-evidencia-s3-poblacion-no-comparable.json` (análisis histórico con `estadio` en `unknownReason = null`) ·
      test después (fixture)

> Evidencia 0.1: `npm run contracts:check` → «sin hallazgos (33 reglas)»; valores alineados con FX-08b-c (A-M2 posmenopáusica).
> Evidencia 1.2: `apps/web/tests/support/msw-ejemplos-aplicabilidad.test.ts` (3 tests en verde) y `tsc --noEmit` limpio.
> Nota 1.1: el Compose de E2E responde por `LLM_PROVIDER=fake` eligiendo el ejemplo `rag-query-*` por `query` exacta
> (`fake_evidence_query.py`); `RAG_ADAPTERS=fake` no existe como modo de ejecución, la semilla no tiene A-M1/A-M2 y el catálogo
> `test-apl-1.2.0` solo existe como fixture de rag-orchestrator (la copia a `packages/clinical-catalogs` es D4-03/L1D-297). Exige
> ejemplos `rag-query-*` nuevos (ai-services) y semilla de pacientes: fuera de mis paths; no se marca `[x]`.

## frontend

- [ ] 2.1 Test de aceptación en rojo: "muestra criterio, valor del paciente, del estudio y estado en texto, y el resumen «✓ Coincide 2 · ◐ Parcial 0 · ✕ No coincide 0 · ? Desconocido 3» cuando se abre doc-a1 [US-126 AC-1]" · Testing Library + MSW · commit `test(L1D-131)`
- [ ] 2.2 Test en rojo: causas de Desconocido, enlace a la ficha, `respaldo_fallido`, `sin_regla_de_comparacion`, `unknownReason = null` de un análisis histórico («? Desconocido · causa no registrada en este análisis») y `varios_valores_en_la_fuente` por compatibilidad hacia atrás [US-126 AC-2] · commit `test(L1D-131)`
- [ ] 2.3 Tests en rojo: etiqueta "Población no comparable" (AC-3), "Dato del paciente sin verificar" (AC-4) · commit `test(L1D-131)`
- [ ] 2.4 Tests en rojo: resumen por fuente al expandir (AC-5), sin puntaje ni porcentaje (AC-6), criterio de orden por aplicabilidad con el literal existente `evidence.orderCriterion.applicability` (AC-7, sin delta propio: cubre el escenario vigente de US-062 AC-7) · commit `test(L1D-131)`
- [ ] 2.5 Tests en rojo: 3 valores + «ver más» con foco y cero peticiones (AC-8, con `studyPopulationValue` como caída), conflicto (AC-9), Parcial y contexto (AC-10), subgrupo en forma nueva como Desconocido con causa y `solo_subgrupo` antiguo como Parcial · commit `test(L1D-131)`
- [ ] 2.6 Literales de estado, causa y rótulos en `apps/web/messages/es.json` (claves `evidence.aplicabilidad.*`) y `valoresDelEstudio()` en `apps/web/lib/evidence/` · `feat(L1D-131)`
- [ ] 2.7 `ApplicabilityTable` + `StudyValueList` + `UnknownReasonText`, montada desde `OptionApplicability`; AC-1…AC-10 en verde; unitarios uno a uno · `feat(L1D-131)`
- [ ] 2.8 Variante A responsive (tarjetas < 560 px), teclado y `aria-expanded`/foco; `visual-check` a 320, 375 y 1280 px con capturas y consola/red limpias · evidencia Gate 2
- [ ] 2.9 Playwright contra Compose con FX-08b-a (AC-1…AC-7) y FX-08b-c (AC-8…AC-10) · E2E
- [ ] 2.10 Regresión RN-23/RN-26/RN-19: textos nuevos recorridos por la lista de US-068; avisos sin bloquear; `aviso-ia.spec.ts` con la tabla desplegada (subcadena del `disclaimer` en `role="note"` y `es.app.academicUseLabel` en la cabecera) · test
