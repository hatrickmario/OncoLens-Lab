# Proposal — l1d-131-tabla-aplicabilidad-fuente

## Trazabilidad

L1D-131 · US-126 · FEAT-08b (L1D-20) · Sprint 4 · Estimación **5** · HU-22 · FR-25 (UI), NFR-12 (estados por texto),
RN-28 (texto del criterio) · RN-23 · RN-26 · RN-03 · AC-08.1 · AC-08.2 · AC-08.4 · AC-08.5 · AC-08.6 · AC-08.8 (UI) ·
AC-10.1 · AC-10.2 · US-126 AC-1…AC-10 · ADR-47 · DEC-11 (US-021) · `[S4 resp. 8]` `[S4 resp. 9]` `[S4 resp. 11]`
`[S4 resp. 13]` `[S4 resp. 14]` `[S4 resp. 15]` · `docs/ux/S4/pantallas-s4.md` S4-01 (variante A) ·
**Excepción a la DoR aceptada (10 AC > 8) `[S4 resp. 13]`:** una sola pantalla y un solo componente (`ApplicabilityTable`).

## Dependencias

- ⛔ DEC-11 (US-021) y ⛔ ADR-47: decisiones, no changes (el texto de los estados y causas sigue `pantallas-s4.md`).
- ↪ `l1d-291-poblacion-lista-contrato-migracion` (US-241, L1D-291): `studyPopulationValues[]`, `partialReason`, motivos
  nuevos de `unknownReason`, ejemplos de `contracts/examples/` y cliente TS regenerado. Este change **no** toca ningún `openapi.yaml`;
  su sección `## contratos` (primera, commit `contract(L1D-131)`) solo crea los ejemplos `EvidenceAnalysis`
  `con-evidencia-s4-poblacion-a-m2.json` y `con-evidencia-s4-poblacion-a-m2-b.json`, de los que salen los MSW de la tabla.
- ↪ `l1d-293-estado-criterio-lista-poblacion` (US-243, L1D-293): los estados con listas llegan calculados; la UI solo los pinta.
- ↪ `l1d-129-aplicabilidad-causas-avisos` (US-124) y `l1d-130-herencia-aplicabilidad-recorte` (US-125), archivados:
  `perSource`, `applicabilitySummary`, `patientValueProvenance`, herencia de la opción.
- ↪ US-061 / US-062 (panel, `OptionApplicability`, `ApplicabilityCounts`, criterio de orden), ya en `main`.
- ↪ US-005 (anclas de la ficha, `[S4 resp. 14]`) y US-003 (contador y enlace): el enlace del AC-2 usa el ancla de US-005; si
  aún no existe, enlaza al encabezado de la ficha (asumido). Colabora sin bloquear con `l1d-294-*` y `l1d-292-*`.
- 🔗 Regresión [RN-23] → US-068 (lista de términos prohibidos recorre `es.json`) · 🔗 Regresión [RN-26] → US-071 ·
  🔗 Regresión [RN-19] → US-069 (aviso de IA y «Uso académico/investigación» visibles con la tabla desplegada).
- ↪ `l1d-145-panel-hasta-3-opciones` (US-135): fija el formato único del resumen por conteos y el literal del criterio de orden que la
  tabla reutiliza; comparten `EvidenceOptionCard`.

## Por qué

El oncólogo debe juzgar si la evidencia aplica a su paciente: criterio a criterio, con la causa de cada Desconocido, los
varios valores del estudio con su fragmento y los avisos en texto, sin puntaje ni porcentaje (RN-28).

## Qué cambia

- **frontend:** organismo `ApplicabilityTable` (por opción y fuente, plegado en «Ver aplicabilidad por criterio»;
  variante A: tarjetas apiladas < 560 px), con celdas de criterio, valor del paciente, valor(es) del estudio y estado en
  texto con símbolo; causas de Desconocido y de Parcial; lista por criterio de hasta 3 valores + «ver más / ver menos»
  sin peticiones nuevas; valores en conflicto sin elegir uno; sección «Contexto (no cuenta para el estado)»;
  etiqueta «Población no comparable» por fuente; «Dato del paciente sin verificar»; resumen por fuente y por opción
  expandible con el mismo formato que la tarjeta («✓ Coincide n · ◐ Parcial n · ✕ No coincide n · ? Desconocido n»); causa para
  todo Desconocido, incluidos `sin_regla_de_comparacion`, el subgrupo de la forma nueva y `unknownReason = null` de los análisis
  históricos («causa no registrada en este análisis»); lectura doble `studyPopulationValues[]` →
  `studyPopulationValue`; textos en `apps/web/messages/es.json`. El criterio de orden (AC-7) usa el literal existente
  `evidence.orderCriterion.applicability`, sin texto propio ni requisito nuevo (redundante con `main`).
- **contratos:** dos ejemplos nuevos `EvidenceAnalysis` en `contracts/examples/` + `index.json`; sin cambio de `openapi.yaml`.
- **clinical-platform:** solo *fixtures* de test (MSW desde esos ejemplos y los de `l1d-291`, perfil de test E2E con FX-08b-a/FX-08b-c y
  catálogo `test-apl-1.2.0` en ambos backends); sin cambio de API, de esquema ni de Route Handlers.
- Sin cambio en `ai-services`.

## Fuera de alcance

Orden visible de varias opciones (US-134), avisos de datos sin verificar/conflicto en la tarjeta (S5: US-101, US-136),
nueva sección de la ficha (US-005 pone las anclas), puntaje o barra de aplicabilidad (prohibido, RN-28), cualquier petición
adicional al backend desde «ver más».

## Pendientes de refinamiento

Ninguno abierto. Asumidos en la historia: `estado_menopausico` (destino `ClinicalAttribute`) enlaza al encabezado de la ficha
(AC-2); fecha y tamaño de muestra junto a cada valor en conflicto solo si constan en su fragmento (AC-9, F-23).
