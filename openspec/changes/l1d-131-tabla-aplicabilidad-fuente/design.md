# Design — l1d-131-tabla-aplicabilidad-fuente

## Contexto

`OptionApplicability` y `ApplicabilityCounts` ya pintan conteos, «no evaluada» y el aviso de no comparable (US-062). Falta la
tabla por criterio. Los datos (`perSource[].criteria[]`, `applicabilitySummary`, `partialReason`, `unknownReason`,
`studyPopulationValues[]`) llegan calculados por Backend 1/2; la UI no recalcula estados ni ordena.

## Decisiones

- **D1 · Un componente.** `ApplicabilityTable` (organismo, `apps/web/components/organisms/applicability-table.tsx`) con
  moléculas `ApplicabilityCriterionRow`, `StudyValueList` (3 valores + «ver más») y `UnknownReasonText`. Se monta desde
  `OptionApplicability` tras la línea de conteos, plegado por opción («Ver aplicabilidad por criterio»; `button` con
  `aria-expanded`). Variante A: < 560 px cada criterio es una tarjeta apilada; sin scroll horizontal (320/375/1280 px).
- **D2 · Estados por texto.** Símbolo (`aria-hidden`) + palabra («Coincide», «Parcial», «No coincide», «Desconocido»), nunca solo
  color (NFR-12). Ningún porcentaje, barra ni número distinto de los conteos por estado (AC-6, RN-28). **Un solo formato del resumen**
  en tarjeta (L1D-145) y tabla: «✓ Coincide 3 · ◐ Parcial 0 · ✕ No coincide 0 · ? Desconocido 2», compuesto por la molécula existente
  `ApplicabilityCounts` desde la única familia de claves `evidence.aplicabilidad.{coincide,parcial,noCoincide,desconocido}`; se
  descarta el formato plural «2 coinciden · 3 desconocidos».
- **D3 · Causas desde literales.** `partialReason` y `unknownReason` se mapean a textos de `apps/web/messages/es.json`
  (claves `evidence.aplicabilidad.parcial.*`, `.desconocido.*`); US-068 los recorre (RN-23). Ningún Desconocido sin causa:
  `sin_regla_de_comparacion` (añadido al contrato por `l1d-291`) → «? Desconocido · el catálogo no define cómo comparar este criterio»;
  `no_reportado_por_fuente` con solo valores `scope = subgrupo` (forma nueva, US-243 AC-6) → «? Desconocido · la fuente no reporta este
  dato para la población elegible (solo para un subgrupo)»; la forma antigua `partialReason = solo_subgrupo` sigue en Parcial («solo un
  subgrupo») durante el S4. `varios_valores_en_la_fuente` queda reservado sin productor en el S4 (US-241): se conserva su texto (muestra
  valores en vez de fallo) solo por compatibilidad hacia atrás. `respaldo_fallido` nunca insinúa coincidencia. `status = desconocido`
  con `unknownReason = null` solo existe en análisis históricos persistidos antes de `l1d-293` (que no se reescriben, RN-06) →
  «? Desconocido · causa no registrada en este análisis»; tampoco ahí queda una fila sin texto de causa.
- **D4 · Lectura doble.** La celda usa `studyPopulationValues[]` si viene y cae a `studyPopulationValue` para análisis antiguos
  (deprecado un sprint, US-241); una función pura `valoresDelEstudio()` en `apps/web/lib/evidence/`.
- **D5 · «Ver más» local.** Estado de UI solo en el cliente; revela el resto de valores ya recibidos con su fragmento, mueve el
  foco al primer valor revelado y conmuta a «ver menos». Cero peticiones (MSW lo cuenta).
- **D6 · Conflicto sin elegir.** Con `valores_en_conflicto` se muestran ambos valores y fragmentos; fecha y tamaño de muestra
  solo si constan en el fragmento (asumido, F-23). Valores `scope = subgrupo|mencion` bajo «Contexto (no cuenta para el estado)».
- **D7 · Enlace a la ficha.** `falta_en_paciente` enlaza al ancla de la sección existente (US-005); sin ancla, al encabezado.
- **D8 · Fragmentos.** «Fragmento [n]» reutiliza la numeración de citas de la tarjeta; solo fragmentos citados por la opción.
- **D9 · Criterio de orden (AC-7), sin texto propio.** La tabla no inventa un texto del criterio: se usa el literal existente
  `evidence.orderCriterion.applicability` de `es.json`, el que fijan `main` (US-062 AC-7) y el MODIFIED de `l1d-145`. Se retira el
  texto «Ordenadas por coincidencia con la población estudiada, no por eficacia», que `main` trata como texto antiguo. **Nota:** el
  requisito ADDED que cubría el AC-7 era redundante con el escenario vigente «Con la opción elegida por aplicabilidad se lee el criterio
  de orden por aplicabilidad» (y con el MODIFIED de `l1d-145`), así que se eliminó; US-126 AC-7 se verifica con un test que cita ese
  escenario (`[US-126 AC-7]`), sin delta propio.

- **D10 · Origen del valor y RN-25 (Gate 2, vuelta 1).** Cada valor del estudio dice su origen en la propia línea: «valor · Fragmento [n] · según {sourceName} · {externalId}» (los chips de cita no numeran, y dos fragmentos de un mismo documento deben distinguirse). Un valor sin fragmento citado se rotula «valor extraído por IA; fragmento no disponible» (RN-01). Con `valores_en_conflicto`, fecha y tamaño de muestra salen de la cita del fragmento y, si faltan, dicen «No disponible» (RN-25), no se omiten; el tamaño se rotula «Tamaño de muestra del estudio» (es de la fuente completa) y la fecha va en `dd/mm/aaaa`. **Decisión del orquestador, pendiente de confirmación del usuario (RN-25 vs AC-9 asumido, F-23: «si no consta, nada»).**
- **D11 · Un solo lugar por regla.** Símbolo, clave y palabra de cada estado viven en `lib/evidence/estados-de-aplicabilidad.ts` (los usan `ApplicabilityCounts` y `CriterionStatus`); la ruta a la ficha se arma solo con `hrefDeFicha` (`lib/ficha/anclas.ts`, exige UUID). Las causas sintéticas (que no son valores del enum del contrato) están bajo `evidence.aplicabilidad.causaSintetica`.
- **D12 · `patientId` por props, deliberado.** Baja por `EvidencePanel → AnalysisResult → EvidenceOptionCard → ApplicabilityTable → ApplicabilitySource → ApplicabilityCriterionRow → CriterionStatus` sin Provider: es un dato del servidor de solo lectura y un único consumidor de hoja; un Provider no se justifica por la evidencia de la tabla de patrones. Pregunta abierta (c) para el usuario.

## Preguntas abiertas para el usuario

- (a) El cliente filtra los valores por los fragmentos que cita la opción, pero el estado se calcula por opción en el servidor: si dos opciones citan la misma fuente con fragmentos distintos, ¿qué garantiza el contrato para que estado y valores mostrados coincidan?
- (b) `patientDataWarning = en_conflicto` (RN-08) y `faltante` no se pintan en la tabla (solo `sin_verificar`): ¿es intencional en el S4 (S5: US-101, US-136)?
- (c) Drilling de `patientId` por 7 niveles (D12): ¿se acepta como deliberado?
- (d) El texto de conflicto de la spec («…requieren contraste con la fuente y con la validación clínica/patológica») difiere del de `pantallas-s4.md` H-12 («Conviene contrastarlos…»): se dejó el de la spec. Se quitó el punto final por homogeneidad.
- (e) La etiqueta «Población no comparable según los datos registrados» no se aplicó: el AC-3 exige la etiqueta visible «Población no comparable» tal cual.

## Privacidad y ownership

Solo `web`; consume `/api/evidence-analyses` sin PII adicional. Los valores del paciente ya vienen desidentificados del
análisis; sin identidad, sin URLs de documentos ni PHI en consola o red (solo `/api/*` del mismo origen). Los valores del
estudio se rotulan «extraídos por IA y verificados», nunca como cita textual (H-02). El enlace a la ficha usa el UUID del
paciente. Sin nuevo acceso a datos clínicos, sin llamadas a `rag-orchestrator`.

**Seguridad web:** `studyPopulationValues[].value` (extraído por un modelo) y los demás textos de la tabla se renderizan solo como texto
de React, nunca como HTML (sin `dangerouslySetInnerHTML`); sin variables `NEXT_PUBLIC_` nuevas; sin cambios de CSP ni de cabeceras; sin
dependencias nuevas.

**Regresión activa [RN-19]:** con la tabla desplegada, la región `role="note"` del `AiDisclaimer` (que muestra tal cual el `disclaimer`
de la respuesta) contiene la subcadena «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» y la
cabecera muestra «Uso académico/investigación» (`es.app.academicUseLabel`), como verifica `apps/web/e2e/aviso-ia.spec.ts`.

## Contratos

Sin cambio de API ni de `openapi.yaml`: consume el contrato de US-241 (`studyPopulationValues[]`, `partialReason`, `unknownReason`)
vía el cliente TS generado de `packages/api-contracts` y `contracts/examples/`; si el cliente generado no trae los campos de US-241,
el change espera a `l1d-291` (⛔ de orden, no se edita a mano lo generado).

**Sección `## contratos` (primera, commit `contract(L1D-131)`): solo ejemplos.** Los tests de UI necesitan casos que ningún ejemplo
vigente trae, y un mock no puede divergir del contrato (US-213), así que el MSW sale de dos ejemplos nuevos, target
`#/components/schemas/EvidenceAnalysis` (spec `clinical-api`), registrados en `index.json`:

- `con-evidencia-s4-poblacion-a-m2.json`: A-M2 con O-P1 (Parcial `inclusiva`, `doc-b1`; además un criterio `respaldo_fallido`),
  O-P5 (Parcial `mezclada`, `doc-b5`) y O-P6 (subgrupo de la forma nueva: Desconocido `no_reportado_por_fuente` con el valor de
  `scope = subgrupo` como contexto).
- `con-evidencia-s4-poblacion-a-m2-b.json`: O-P4 (conflicto, `valores_en_conflicto` con `ch-b4-1` y `ch-b4-2`), O-P10 (4 valores
  de elegibilidad para «ver más») y un criterio `sin_regla_de_comparacion`.

Se parten en dos porque `EvidenceAnalysis.evidenceOptions` tiene `maxItems: 3`. Validan con `contracts:check` contra el enum de
`contracts/schemas/evidence.yaml` 1.1.0 (`l1d-291`). La forma antigua sale de `con-evidencia-s3-aplicabilidad.json` y el análisis
histórico con `unknownReason = null` de `con-evidencia-s3-poblacion-no-comparable.json` (su `estadio` conserva `null`; `l1d-293` solo
actualiza `con-evidencia-s3-aplicabilidad.json` y `rag-query-aplicabilidad-a-m1.json`).

## Evaluación

No toca modelo, prompt, umbral, catálogo ni corpus; sin `evaluate`. Los fixtures FX-08b-c ya los fija US-241.

## Riesgos

Diez AC en un componente: las pruebas se agrupan por _fixture_. `visual-check` a 320/375/1280 px contra `pantallas-s4.md`.
