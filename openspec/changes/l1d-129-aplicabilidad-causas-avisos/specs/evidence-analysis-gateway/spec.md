# Spec Delta — evidence-analysis-gateway (l1d-129)

## ADDED Requirements

### Requirement: Aplicabilidad persistida igual a la respondida
`clinical-api` MUST persistir en `clinical.ai_analysis_record.applicability` la `applicability` recibida de `rag-orchestrator` sin transformarla, con sus causas, avisos, conteos y `populationNotComparable`, y la respuesta `200` SHALL construirse desde ese valor persistido (RN-06, AC-T1.4).

#### Scenario: La aplicabilidad de A-M1 con doc-a1 se lee igual del registro [US-124 AC-7]
- **GIVEN** `doc1@test.local` con sesión válida, A-M1 sembrado por el test y `rag-orchestrator` simulado con MSW respondiendo una `applicability` de `doc-a1` con `estado_menopausico` en `desconocido` (`falta_en_paciente`, `patientDataWarning = faltante`), `ecog` con `patientDataWarning = sin_verificar` y `summary = { coincide: 3, parcial: 0, noCoincide: 0, desconocido: 2 }`, construida desde `contracts/examples/`
- **WHEN** envía `POST /platform/evidence-analyses` y después se lee el `AIAnalysisRecord` del `id` respondido
- **THEN** `applicability` del registro es igual, campo a campo, a la `applicability` de la respuesta [RN-06] [AC-T1.4]
- **AND** la respuesta valida contra el spec de `clinical-api`
