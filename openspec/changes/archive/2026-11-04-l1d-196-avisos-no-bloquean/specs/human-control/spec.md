## ADDED Requirements

### Requirement: El análisis de un paciente con avisos clínicos responde 200 con sus avisos
Para un paciente de un tipo habilitado con datos `requiere_revision`, datos en conflicto, datos críticos faltantes y una fuente de población no comparable, `POST /platform/evidence-analyses` MUST responder `200` con la opción y los avisos que existen en el S5 en su lugar del contrato; ningún aviso clínico SHALL convertirse en `4xx` ni ocultar la opción (RN-26).

#### Scenario: FX-T3-a con continueWithWarning responde 200 con población no comparable en warnings[] y faltantes y sin verificar declarados en la Base del análisis, no emitidos en warnings[] [US-071 AC-1] [RN-26] [AC-T3.3]
- **GIVEN** FX-T3-a (HER2 `3+` `verificado`, Ki-67 `20 %` `requiere_revision`, dos RE en conflicto, sin `estado_menopausico`) y `rag-orchestrator` simulado con `contracts/examples/rag-query-fx-t3-a.json`
- **WHEN** el doctor solicita el análisis con `continueWithWarning = true`
- **THEN** la respuesta es `200`, válida contra el spec del proveedor, con una opción en `evidenceOptions`
- **AND** esa opción trae `populationNotComparable = true` y `warnings = [poblacion_no_comparable]`
- **AND** el aviso de faltantes está declarado en la Base del análisis: `analysisBasis.missingCriticalData` contiene `estado_menopausico` y `continuedWithWarning` es `true`
- **AND** el aviso de dato sin verificar está declarado en la Base del análisis: `analysisBasis.patientDataUsed` incluye Ki-67 con `reviewStatus = requiere_revision`
- **AND** `warnings[]` no contiene `datos_faltantes`, `datos_sin_verificar` ni `datos_en_conflicto` (D1, `[S5 resp. 12]`)
- **AND** el `AIAnalysisRecord` queda persistido con los mismos faltantes

Notas de alcance:
- Regresión [RN-26] `datos_en_conflicto` (opción y tarjeta) y `datos_sin_verificar` en `evidenceOptions[].warnings`: activa desde S6/Post-MVP con US-101 y US-136; hoy FX-T3-a incluye el conflicto solo para probar que no bloquea.
- Regresión [RN-26] `patientDataWarning = en_conflicto` por criterio (US-124): activa desde S6/Post-MVP; ningún escenario del S5 lo afirma (`[S5 resp. 12]`).
- Regresión [RN-26] «desactualizado»: activa desde S6 con FEAT-11a (si hay capacidad).
- Regresión [RN-15] `403` por opt-out de `analisis_ia`: activa desde S6 con US-148. El `401` sin sesión y el `422 PACIENTE_EGRESADO` en registros siguen cubiertos por `auth-session` y `manual-clinical-entry`.

### Requirement: Las lecturas del paciente responden 200 con sus avisos
La ficha (`GET /platform/patients/{id}`), la vista de caso (`GET /platform/patients/{id}/case`) y el checklist (`GET /platform/patients/{id}/completeness`) MUST responder `200` para un paciente con avisos clínicos, mostrando el estado de cada dato en lugar de rechazar la lectura (RN-26, FR-11).

#### Scenario: Ficha, vista de caso y checklist de FX-T3-a responden 200 con sus avisos [US-071 AC-4] [RN-26] [FR-11]
- **GIVEN** FX-T3-a sembrado con el catálogo de datos críticos `test-1.0.0`
- **WHEN** se consultan la ficha, la vista de caso y `GET …/completeness` con una sesión `doctor`
- **THEN** las tres responden `200`, válidas contra el spec del proveedor
- **AND** la ficha y la vista de caso traen Ki-67 con `provenance.reviewStatus = requiere_revision`
- **AND** el checklist trae `ki67` en `presente_sin_verificar` y `estado_menopausico` en `faltante`

### Requirement: El panel ejecuta el análisis y muestra la opción no comparable pese a los avisos
Con avisos clínicos, el panel de análisis MUST permitir ejecutar el análisis desde el aviso previo de faltantes y MUST mostrar cada opción con la etiqueta «Población no comparable» cuando corresponda, sin ocultarla ni deshabilitarla (RN-26).

#### Scenario: Continuar con el aviso de faltantes ejecuta el análisis y muestra el resultado [US-071 AC-2] [RN-26] [AC-04.2]
- **GIVEN** FX-T3-a en el panel `/pacientes/{id}/analisis` contra Compose en perfil de test (`LLM_PROVIDER=fake`)
- **WHEN** el bloque de faltantes (`role="status"`) lista «Estado menopáusico» y el doctor pulsa «Analizar evidencia» con la pregunta de `rag-query-request-fx-t3-a.json`
- **THEN** se envía un solo `POST /api/evidence-analyses` con `continueWithWarning = true`
- **AND** se muestra el resultado del análisis

#### Scenario: La opción de población no comparable se muestra con su etiqueta [US-071 AC-3] [RN-26] [AC-08.6]
- **GIVEN** el resultado del escenario anterior
- **WHEN** se renderiza el análisis
- **THEN** la opción de la fuente no comparable es visible con la etiqueta «Población no comparable» en texto
- **AND** no está oculta, plegada sin acceso ni deshabilitada

### Requirement: El recorrido del doctor no tiene ningún diálogo obligatorio
El recorrido login → ficha → vista de caso → faltantes → análisis MUST completarse sin ningún `dialog` ni `alertdialog` obligatorio; solo MAY aparecer los diálogos de registro que el oncólogo abre por su cuenta («Registrar biomarcador», «Completar diagnóstico a mano», «Agregar tratamiento previo», «Registrar atributo»), y ninguno se abre solo ni se interpone entre el oncólogo y el análisis (AC-T3.3, PP-6, `[S5 resp. 12]`).

#### Scenario: El doctor llega al resultado de FX-T3-a sin ningún diálogo obligatorio [US-071 AC-5] [AC-T3.3] [PP-6]
- **GIVEN** FX-T3-a sembrado en Compose en perfil de test
- **WHEN** en Playwright el doctor inicia sesión, abre la ficha de FX-T3-a, elige «Ver caso clínico», revisa los datos críticos faltantes sin abrir ninguna acción de registro, elige «Analizar la evidencia para este caso» en la vista de caso y pulsa «Analizar evidencia» en el panel
- **THEN** llega a `analysis-result` con la opción visible
- **AND** en ningún paso aparece un elemento `role="dialog"` o `role="alertdialog"` (los diálogos «Registrar biomarcador», «Completar diagnóstico a mano», «Agregar tratamiento previo» y «Registrar atributo» solo existen si el oncólogo los abre, y en este recorrido no los abre)
- **AND** ningún botón del recorrido queda deshabilitado por un aviso clínico
