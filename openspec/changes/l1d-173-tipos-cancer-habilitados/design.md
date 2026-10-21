# Design — l1d-173-tipos-cancer-habilitados

## Contexto

El contrato ya incluye `status = tipo_no_habilitado` en `EvidenceAnalysis` (ejemplo `tipo-no-habilitado.json`),
`cancerTypeEnabled` en `PatientSummary`/`PatientListItem` y el `422 TIPO_NO_HABILITADO` de `rag-orchestrator`
(`rag-query-tipo-no-habilitado-422.json`). Nada de esto está implementado: el gateway no comprueba el tipo,
`rag-orchestrator` no lee `ENABLED_CANCER_TYPES` y el panel trata cualquier estado distinto de
`con_evidencia`/`sin_evidencia` como `no_soportado`.

## Decisiones

**D1 · Criterio de "listo" (DEC-19).** Decidido en el refinamiento del S2 (P-4, decidido por el usuario el 2026-10-21): el
criterio de "listo" de RN-20 aplica como **prerrequisito de G-Piloto**, no de la demo sintética. Mama y próstata
se habilitan desde el S2 con corpus semilla y catálogo `propuesta`. Este change no implementa el criterio; deja
la regla de habilitación en configuración (RN-22).

**D2 · Literal unificado.** Decidido en el refinamiento del S2 (P-4, decidido por el usuario el 2026-10-21): el texto de UI es
"Tipo de cáncer fuera del alcance del piloto: sin análisis con IA" (contiene el literal de US-043 AC-3 y el de
`flujo-e2e.md`). Vive en `apps/web/messages/es.json`, clave `alcance.tipoNoHabilitado`, consumida por la ficha,
el listado (L1D-202) y el panel; la crea el primer change que mergee y este change es su dueño semántico.

**D3 · Comprobación en el gateway antes del contexto.** `EvidenceAnalysisService` evalúa `estaHabilitado(tipo)`
del `Diagnosis` activo después de las guardas existentes (sesión, rol, paciente, tipo registrado) y **antes** de
construir el contexto clínico o desidentificar. Si no está habilitado: construye el `EvidenceAnalysis` con
`status = tipo_no_habilitado`, `evidenceOptions = []`, `discardedOptions = []`, `topRelevanceScore = null` y la
`analysisBasis` de D7, lo persiste (RN-06) y responde `200`. Regla extraída:
`alcanceDelTipo()` en `case-guards.ts` (devuelve un resultado, no lanza: no es error).
Orden respecto del caso sin tipo (`422 TIPO_CANCER_NO_REGISTRADO`): sin tipo → `422`; con tipo no habilitado → `200 tipo_no_habilitado`.

**D4 · Validación de la configuración.** `ENABLED_CANCER_TYPES` (lista separada por comas) se valida al arrancar
contra `manifest.cancerTypes`: vacía o con un tipo ausente → no listo, con el evento único de `l1d-167`
`configuracion_invalida` (`variable = ENABLED_CANCER_TYPES`, `motivo = variable_ausente` si está vacía o
`tipo_no_en_catalogo`) y el tipo inválido **solo** en el campo cerrado `valorInvalido` (excepción de `l1d-167` D2
para enums no sensibles: no es PII ni secreto; el AC-5 lo exige). Misma regla en ambos backends (`validarTiposHabilitados()`).
El adaptador `TiposDeCancerHabilitados` de L1D-72 pasa a usar esta lista validada.

**D5 · Defensa en B2.** `RAGOrchestratorService` comprueba `clinicalContext.diagnosis.cancerType` contra
`ENABLED_CANCER_TYPES` tras la versión del catálogo (L1D-171) y antes de recuperar: no habilitado → `422
TIPO_NO_HABILITADO` (`message` fijo, sin eco). El enum de `status` interno sigue `con_evidencia | sin_evidencia`.

**D6 · Panel.** `clasificarResultado()` gana la clase `tipo_no_habilitado`; el panel muestra el aviso informativo
con el literal de D2 y la Base del análisis (sin opciones), no un error. La acción "Analizar evidencia" de la
ficha sigue visible (el backend es dueño de la regla, S2-04).

**D7 · Base del análisis en `tipo_no_habilitado`.** Sin llamada a Backend 2 no hay `meta` ni `retrievalStats`;
la arma `construirBaseTipoNoHabilitado()` (pura, en el módulo `evidence-analysis`; `l1d-186` cubre solo las ramas que
llaman a Backend 2): (a) `patientDataUsed = []` (no se envió ningún dato); (d) `sourcesConsulted.selected` y
`filters` iguales al request, `retrieved = 0`, `aboveThreshold = 0`; (e) `sourcesNotIncluded` desde
`CORPUS_EXCLUDED_SOURCES` (la misma clave que usa el cargador del corpus para `CorpusRelease.excluded_sources`);
(f) `corpusCutoffDate` desde `CORPUS_CUTOFF_DATE` (`AAAA-MM-DD`, RN-22), la clave que actualiza el script de carga
del corpus (`load_seed_corpus`) al publicar una release; `limitations` con la estructural "El tipo de cáncer no está
habilitado en este entorno." (como `tipo-no-habilitado.json`); `missingCriticalData`, `assumptions`,
`priorAnalysesUsed`, `agentSteps` vacíos y `omittedClaims = 0`. **Decidido (usuario, 2026-10-21, `[S2 resp. 10]`)** el origen de (f) en `CORPUS_CUTOFF_DATE`. Ambas claves se validan en el módulo de
configuración de `l1d-167` (fecha inválida o ausente → `configuracion_invalida`).

## Privacidad y ownership

- Con tipo no habilitado **no** se construye ni se envía contexto a `rag-orchestrator`: menos datos cruzan la
  frontera. Si llegara un contexto (defensa), B2 lo rechaza sin procesarlo ni registrarlo, **con `LLM_PROVIDER=local`**; con `LLM_PROVIDER=fake` la defensa no se aplica (ver preguntas para el humano).
- El registro persistido no contiene identidad (mismo `AIAnalysisRecord` del S1). `rag-orchestrator` sigue sin datos
  clínicos ni `clinical-minio`.

### Seguridad web

Sin `NEXT_PUBLIC_` nuevas ni dependencias; el aviso es texto de React desde `es.json`; sin cambios de CSP.

## Contratos

**Sin diff.** Proveedor `clinical-api`: `EvidenceAnalysis.status` ya admite `tipo_no_habilitado`
(`tipo-no-habilitado.json`), `PatientSummary.cancerTypeEnabled`. Proveedor `rag-orchestrator`: `422`
`ErrorTipoNoHabilitado` (`rag-query-tipo-no-habilitado-422.json`). Si al implementar `tipo-no-habilitado.json`
no valida con la Base del S1, se corrige el ejemplo (no el spec) en un commit `contract(L1D-173)`. Compatible con ADR-26.

## Componentes y patrones

- `molecules/scope-notice.tsx` (aviso informativo de alcance, `Alert` de shadcn en variante informativa, nunca de
  error); lo usan la ficha (L1D-72) y el panel. Dos consumidores: componente compartido, sin patrón adicional.
- `lib/evidence/clasificar-resultado.ts`: nueva clase. RSC en la ficha; el panel ya es `'use client'` (sin cambios de montaje).

## Dependencias y colaboradores

- `clinical-api`: `case-guards.ts` (`alcanceDelTipo()`), `evidence-analysis.service.ts` (rama `tipo_no_habilitado`
  con persistencia vía el repository existente), `config/` (`validarTiposHabilitados()`), adaptador de `TiposDeCancerHabilitados`.
- `rag-orchestrator`: `domain/tipos_habilitados.py` (`exigir_tipo_habilitado()`), `config/settings.py`
  (`enabled_cancer_types`), `api/errors.py` (mapeo a `422`).

## Tests

AC-1…AC-3: Supertest + PostgreSQL de test con el seed y MSW con contador hacia `rag-orchestrator`; AC-3 en la UI con
Testing Library; AC-4: Pytest con adapters falsos; AC-5: arranque. E2E (ficha del paciente b con `ENABLED_CANCER_TYPES=mama`)
cuando exista el job de L1D-278.

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus: `run-ai-eval` no aplica.

## Pendiente de definir

- Nada. D1 y D2 decididos (`[S2 resp. 6]`); D7, `corpusCutoffDate` desde `CORPUS_CUTOFF_DATE` (`[S2 resp. 10]`).

## Notas de implementación (clinical-platform)

- **Pregunta enmascarada en `tipo_no_habilitado`.** D3 dice "antes de ... desidentificar", pero la pregunta se persiste
  (`query_text`) y se devuelve (`queryText`): RN-11 exige enmascararla. El service llama al desidentificador con un
  **contexto vacío** (`construirContextoSinDatosClinicos()`) y toma solo la pregunta; ningún dato del caso se construye ni viaja a
  Backend 2. El snapshot persistido es ese contexto vacío.
- **Idiomas** del registro sin Backend 2: `es`/`es` (idioma del producto).
- **Ficha (AC-1 y AC-3, `cancerTypeEnabled`)**: `l1d-72-ficha-minima-paciente` no está implementado, no existe el
  endpoint de la ficha. Aquí se entrega el adaptador `crearTiposHabilitados()` (puerto `TiposDeCancerHabilitados` en
  `evidence-analysis/ports.ts`) probado en unitario; los escenarios de ficha de AC-1/AC-3 se cubren al implementar L1D-72.
- **Manifiesto**: `crearProveedorDeCatalogo()` expone `cancerTypes()`. El esquema (`infrastructure/catalogo/manifiesto.schema.ts`) es único para el arranque y el seed y `cancerTypes` es obligatorio (como en Python y en `manifest.schema.json`): un manifiesto sin él da `catalogo_no_disponible`, no `tipo_no_en_catalogo`.
- **Piso de fuentes excluidas (RN-21)**: `CORPUS_EXCLUDED_SOURCES` debe incluir NCCN y ESMO (`configuracion_invalida` si no). `crearTiposHabilitados()` valida contra los tipos del catálogo al crearse.
- **Claves nuevas obligatorias en `clinical-api`**: `ENABLED_CANCER_TYPES` (demo `mama,prostata`), `CORPUS_EXCLUDED_SOURCES`
  (demo `NCCN,ESMO`) y `CORPUS_CUTOFF_DATE` (demo `2026-09-30`). El servicio `clinical-api` de `docker-compose.yml` las pasa
  con `${CLAVE:-<valor demo>}`, así que Compose arranca sin `.env`. **Pendiente del usuario**: añadirlas a
  `infra/docker/.env.example` y a `docs/operations/claves.md`.

## Notas de implementación (ai-services)

- **Orden en el servicio.** `RAGOrchestratorService.consultar` comprueba el tipo **después** de `_filtro_de_recuperacion` (un
  tipo inutilizable sigue siendo `422 TIPO_CANCER_NO_REGISTRADO`, comportamiento previo de OL-02) y **antes** de cualquier
  puerto: idioma, release, embeddings, Milvus, reranker, LLM y NLI quedan en cero invocaciones. Sin `diagnosis` no hay tipo
  que comprobar y responde `TIPO_CANCER_NO_REGISTRADO`.
- **Puerto `CatalogoClinico.tipos_de_cancer()`** (adapter del manifiesto; `cancerTypes` obligatorio, si falta `CatalogoNoDisponible`).
- **`ENABLED_CANCER_TYPES`** (`Settings.enabled_cancer_types`, lista por comas, defecto vacío = ningún tipo habilitado, falla
  cerrada). Al arrancar: con `LLM_PROVIDER=local` vacía es `configuracion_invalida` (`variable_ausente`); con cualquier proveedor un
  tipo ausente del manifiesto es `configuracion_invalida` (`tipo_no_en_catalogo`); el evento nunca lleva el tipo.
- **Regla única de «obligatoria con local».** La lista vacía se detecta en `claves_de_recuperacion_ausentes` (fuente única del
  arranque y de la composición); `_eventos_de_tipos_habilitados` conserva solo el cruce con el manifiesto.
- **Preguntas para el humano (sin cambio de comportamiento):**
  1. Modo `fake`: `ConsultaConCatalogoExigido` no aplica RN-20 (lo cubre el gateway de `clinical-api`). Alternativas: aplicar
     la regla también en `fake` (más defensa, el E2E con LLM fingido la ejercería) o aceptar la omisión.
  2. D5 dice «tras la versión del catálogo»; la comprobación va tras `_filtro_de_recuperacion` para que un tipo
     inutilizable siga siendo `TIPO_CANCER_NO_REGISTRADO`. Alternativas: dejarlo así o mover la comprobación antes del
     filtro (un tipo inutilizable pasaría a `TIPO_NO_HABILITADO`).
- **Deuda:** el puerto `CatalogoClinico` crece con `tipos_de_cancer()` (versión + tipos); si sigue creciendo, separar un
  puerto de lectura de tipos (ISP).
- **Pendiente de plataforma (Compose) — resuelto en f0128f0:** el servicio `rag-orchestrator` de `infra/docker/docker-compose.yml` aún no pasa
  `ENABLED_CANCER_TYPES`; con `LLM_PROVIDER=local` no arrancará hasta añadir
  `ENABLED_CANCER_TYPES: ${ENABLED_CANCER_TYPES:-mama,prostata}` (mismo valor demo que `clinical-api`). El modo `fake`
  (`ConsultaConCatalogoExigido`) no aplica la regla: lo cubre el gateway de `clinical-api`.

## Preguntas y decisiones para el humano (Gate 2)

- **`CORPUS_CUTOFF_DATE`**: `.env.example` dice `2026-10-01` frente a `2026-09-30` del Compose y de los ejemplos. No lo alineé
  (no leo ni edito `.env*`): decisión y acción del usuario.
- **P2-1**: ¿aplicar RN-20 también con `LLM_PROVIDER=fake` en Backend 2, o aceptar que ahí no se aplica? Hoy Python con
  `fake` arranca con la lista vacía.
- **Desviación de D5**: en Backend 2 la comprobación del tipo va después de `_filtro_de_recuperacion`, no antes de recuperar.

## Deuda (a historia propuesta)

- **Fuente única de los hechos del corpus en la Base del análisis**: hoy `CORPUS_EXCLUDED_SOURCES` y `CORPUS_CUTOFF_DATE`
  se configuran en clinical-api y en el cargador; lo correcto es leerlos del release del corpus de Backend 2.
- Hallazgos menores P3-8, P3-11 y P3-12 del Gate 2: diferidos.
