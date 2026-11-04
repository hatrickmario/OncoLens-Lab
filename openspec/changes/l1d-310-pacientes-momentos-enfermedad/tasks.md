# Tasks — l1d-310-pacientes-momentos-enfermedad

> ↪ `l1d-80-tratamientos-atributos-manuales` (listas de `setting` y `values` de atributos en `atributos.json` 1.2.0 / manifest 1.4.0, con `sensible_castracion`; subconjunto ATC real) antes de fijar los valores
> de §2.2; ↪ `l1d-74-vista-caso-timeline` (`GET …/case`) antes de la tarea 2.6 (AC-2). 🔗 `l1d-309` toca `sembrar.ts`
> (notas de (a)): conflicto trivial, orden de PR. Matriz TDD (CLAUDE.md): seed, datos, scripts y guía → **test
> después** (el test va en el mismo PR); la regla `historiaCoherente()` es lógica pura con su unitario; ejemplos →
> `contracts:check`. Integración con PostgreSQL real; nunca `vi.mock` de módulos propios ni de Prisma; reloj del seed
> inyectado (`relojDelSeed`), IDs con `idSembrado`; nunca `.skip`/`.only`/`it.todo`. Solo datos sintéticos.

## 1. contratos

- [x] 1.1 (test después: ejemplos) Escribir los 7 pares `contracts/examples/rag-query-request-demo-s5-<paciente>.json`
  (`RagQueryInternalRequest`, `patientContext` desidentificado coherente con el paciente: seudónimo, fechas relativas)
  y `rag-query-demo-s5-<paciente>.json` (`RagQueryInternalResponse`, `con_evidencia`, `optionsNotShown = 0`, citas a
  `chunkId` existentes del corpus de la demo, `applicabilitySummary` según `design.md` D6, lenguaje no prescriptivo,
  RN-23) y registrarlos en `index.json` con su `request`. Preguntas exactas distintas entre sí y de las del S4.
  `contracts:check` en verde; `contracts:breaking` sin diferencias (no cambia ningún `openapi.yaml`). Commit
  `contract(L1D-310)`.
  Evidencia: contracts:check 33 reglas sin hallazgos; contracts:breaking sin cambios; commits cb08e56e y 570cec8b.
- [x] 1.2 (test después) Ampliar `apps/rag-orchestrator/tests/unit/test_fake_evidence_query.py`: «carga los ejemplos
  demo-s5 y cada pregunta selecciona su respuesta con_evidencia [US-254 AC-4]» (sin tocar código de `rag-orchestrator`).

  Evidencia: pytest 4 passed (test_fake_evidence_query.py).
## 2. clinical-platform

- [x] 2.1 (test después: tipos del seed) `pacientes/tipos.ts`: `TratamientoPreviaSemilla.fin?` y
  `EventoSemilla.tipo` ampliado (D2); `sembrar.ts` escribe `ended_at`, `ongoing = false`, `end_reason` y el
  `prior_treatment_id` del evento de progresión que cierra una línea; exporta `PACIENTES_SEMILLA`. (a)–(f) sin cambios
  (los tests de contenido de US-039 AC-2 siguen en verde).
  Evidencia: tsc 0 errores; seed integración verde; (a)–(f) intactos.
- [x] 2.2 (test después: datos) Ficheros `pacientes/{g,h,i,j,k,l,m}.ts` con el contenido de `design.md` D1, términos
  canónicos y biomarcadores con los nombres del catálogo de datos críticos; valores de atributos y `setting` de las
  listas de `l1d-80` (D6/D7; (l) con `sensible_castracion`, decidido; deprivación androgénica = leuprorelina `L02AE02`, solo ATC reales del subconjunto de `l1d-80`); añadirlos al final de `PACIENTES_SEMILLA` (ordinales 7–13);
  actualizar el comentario de `identidades.ts`.
  Evidencia: ficheros g–m y auxiliares.ts; seed integración verde; (g)–(m) = ordinales 7–13.
- [x] 2.3 (TDD: regla pura) Extraer `historiaCoherente()` (D3) en `pacientes/coherencia.ts`: unitarios uno a uno
  (línea antes del diagnóstico, fin antes del inicio, solape con la línea siguiente, hueco en la numeración, evento
  antes del diagnóstico, fecha futura) y test «los 13 pacientes semilla tienen una historia coherente [US-254 AC-2]»
  y «detecta la línea 2 de (k) que empieza antes del fin de la línea 1 [US-254 AC-2]».
  Evidencia: unitarios 11 passed (rojo a8bcf746 con 9 fallos, verde 886b893e); la regla se aplica a los 7 nuevos (design «Ajustes al implementar»).
- [x] 2.4 (test después: seed, integración) Test de conteos del seed `tests/integration/seed/momentos-enfermedad.test.ts`:
  «carga los 7 pacientes nuevos con su tipo de cáncer y 13 pacientes semilla [US-254 AC-1]», «(k) tiene trastuzumab,
  pertuzumab y trastuzumab emtansina por línea; (l) sensible y (m) resistente_castracion [US-254 AC-1]», «un régimen
  sin ATC en el catálogo queda no_mapeado [US-254 AC-1]», «ids deterministas e idempotentes e identidades
  SINT-0000007…13 [US-254 AC-5]», «en piloto no escribe ninguna fila de (a)–(m) [US-254 AC-5]». Tiempo máximo
  explícito si arranca procesos.
  Evidencia: momentos-enfermedad.test.ts verde; integración completa 133 archivos / 688 tests passed.
- [x] 2.5 (test después) Una sola fuente del número de pacientes (D5): `listado.test.ts`, `orden.test.ts`,
  `contrasenas-e-idempotencia.test.ts`, `identidades.test.ts`, `indice-ciego-del-nombre.test.ts`, `contenido.test.ts`
  y `tests/support/pacientes.ts` leen `PACIENTES_SEMILLA.length` (el escenario «El seed escribe cinco identidades
  cifradas» pasa a «= pacientes semilla»); revisar que `PAGE_SIZE_DE_TEST` siga dando más de una página. Ningún test se
  quita ni se relaja.
  Evidencia: ya leían PACIENTES_SEMILLA.length; corregidos identidades.test.ts, PAGE_SIZE_DE_TEST y el pageSize fijo de listado y orden.
- [x] 2.6 (test después: integración, ↪ `l1d-74`) «GET /case de cada paciente nuevo trae priorTreatments por línea y
  sus eventos en orden cronológico, validado contra el spec [US-254 AC-2]» (Supertest + PostgreSQL real con el seed).
  Evidencia: pacientes-momentos.test.ts verde (Supertest + PostgreSQL real + spec).
- [x] 2.7 (test después: integración) «(g) y (l) tienen faltantes distintos y no vacíos y (k) ninguno, sin bloquear la
  ficha [US-254 AC-3]» con el servicio de completitud y el catálogo real; el test imprime la lista que se copia a la
  guía (§2.10).
  Evidencia: pacientes-momentos.test.ts verde; g: her2_ish, ki67, tratamientos_previos, brca_germinal; h e i: brca_germinal; l: hrr_brca; j, k y m: ninguno.
- [x] 2.8 (test después: verificación del seed) `contar.ts` suma `clinical.prior_treatment`, `clinical.clinical_event`
  y `clinical.clinical_attribute` (`count(*)`); `verificar-conteos.py` los compara como mínimos (D4). Tests:
  `tests/unit/seed-contar.test.ts` y `scripts/demo/__tests__/levantar.test.mjs` («falla nombrando
  clinical.prior_treatment cuando hay menos de los publicados [US-254 AC-5]», «pasa con un tratamiento manual de más
  [US-254 AC-5]»); el humo existente de 0 identidades sigue en verde.
  Evidencia: seed-contar y levantar.test.mjs 15 passed.
- [ ] 2.9 DIFERIDA -> H-2 (ensayo de `levantar.sh` desde cero) (test después: humo) `levantar.sh` desde cero imprime en «Verificación del seed» `esperado=13 obtenido=13`
  para pacientes e identidades y los tres mínimos nuevos; salida sin cadena de conexión ni contraseñas (privacy P2).
  Evidencia en el PR (salida recortada) [US-254 AC-5].
  TRASLADADA a H-2: `levantar.sh` desde cero exige Ollama y el corpus real; cubierto por los unitarios del verificador y por el seed de 13 pacientes en el Compose del E2E.
- [x] 2.10 (test después: guía) `docs/demo/guia-demo-S5.md`, sección «Pacientes en distintos momentos de la
  enfermedad»: tabla por paciente (momento, historia resumida, faltantes calculados en 2.7, pregunta sugerida exacta) y
  bloque `<!-- conteos-demo-s5:inicio -->`/`fin` con los conteos por opción y `poblacionNoComparable`; enlace a
  `runbook-demo-S1.md` y nota «solo modo fingido; en vivo los estados los calculan las reglas».
  Evidencia: docs/demo/guia-demo-S5.md; lint:lenguaje 0 hallazgos.
- [x] 2.11 (test después: E2E) `apps/web/e2e/demo-s5-pacientes.spec.ts` (patrón de `demo-s4-pares.spec.ts`): lee el
  bloque de la guía, comprueba que los ejemplos fijos coinciden con él y, contra Compose con `LLM_PROVIDER=fake`, que
  cada paciente (g)–(m) con su pregunta devuelve esos conteos y la marca de no comparable [US-254 AC-4]. Actualizar
  `apps/web/e2e/pacientes-listado.spec.ts` (US-048 AC-1) para que no dependa de «cinco». `setTimeout` explícito.
  Evidencia: E2E completo 59 passed (1.8 min), incl. 9 de demo-s5 y el listado; (l) y (m): ficha con aviso de alcance (el stack E2E es solo mama).
- [x] 2.12 (test después: CI) Comprobar en el PR que los jobs de escaneo de secretos (gitleaks) y de PII (data-scan)
  pasan sin hallazgos con los ficheros nuevos [US-254 AC-5].
  Cumplida por los jobs de secretos (`secret-scan`) y `data-scan` de la CI del PR #316, ambos en pass; `pii-scan` y `dataset-class-check` locales también sin hallazgos.
- [x] 2.13 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
  antes y después, commit `refactor(L1D-310)`.

  Evidencia: Extract · auxiliares.ts:estadoMenopausico · atributo literal repetido en 5 ficheros (e3838c1d).
## 3. evaluación

- [x] 3.1 No aplica `run-ai-eval`: no cambia modelo, prompt, umbral, catálogo ni corpus (los ejemplos fingidos no
  entran en `evaluate`). Anotarlo en el PR.

  Evidencia: no aplica run-ai-eval: no cambia modelo, prompt, umbral, catálogo ni corpus.
## 3b. Hallazgos del Gate 2 (vuelta 1)

- [x] G2-1 (language Mayor 1, RN-01) Texto de las opciones de (i) y (j) fiel al alcance del fragmento citado (y de los demás ejemplos); estadio No coincide en (j); conteos de la guía actualizados. Evidencia: contracts:check sin hallazgos, commit e2b1b155.
- [x] G2-2 (language Mayor 2, design #3) Guía con la nota de alcance de (l) y (m), encabezado «Opciones descritas en la evidencia», spec y design con el alcance reducido de AC-4; cruce de `priorTreatments` de los 7 ejemplos contra el seed en `seed-pacientes-semilla.test.ts`.
- [x] G2-3 (design #1) `resolverAtcDelRegimen` en `seed/catalogo.ts` (solo del seed); aserciones de (j) y (l) en `momentos-enfermedad.test.ts`.
- [x] G2-4 (design #2) Oráculo de `codigos-del-catalogo.test.ts` desde `PACIENTES_SEMILLA[].farmacos ?? [regimen]`, con un caso donde difieren.
- [x] G2-5 (design #4) `idDeTratamiento()` en `determinismo.ts`; test de `cierraLinea` y de la fecha de cierre.
- Deuda (destino): D5-36 `farmacos` obligatorio y rename `diasDesdeElInicio` → `diasAntesDelInicio`; D5-37 lista explícita `PACIENTES_COHERENTES` y derivar `HISTORIA` de `contar.ts`; D5-38 `assumptions []` con criterios Desconocido y «No disponible» en web para metadatos null.

## 4. humano

- [x] H-1 Comprobar que `l1d-80` ya añadió «sensible a la castración» (`sensible_castracion`) en `estado_castracion`
  (P-1 decidido, `[S5 resp. 13]`; también para (b)) antes del merge de este change. DIFERIDA -> H-1
  Verificado en main: `atributos.json` 1.2.0 trae `sensible_castracion` en `estado_castracion`; manifest 1.4.0.
- [ ] H-2 DIFERIDA -> H-2 Ensayo de la demo: `levantar.sh` desde cero y recorrido de (g)–(m) en la vista de caso (US-142, G-Demo).
  DIFERIDA -> H-2

## 5. Verificación

- [x] 5.1 `openspec validate l1d-310-pacientes-momentos-enfermedad --strict` en verde.
- [x] 5.2 Tests de `clinical-api` (unit + integración), `scripts/demo/__tests__`, el test del fake de
  `rag-orchestrator` y el E2E de la demo en verde; `contracts:check` en verde (sin `contracts:verify-provider`: no
  cambia la API).

## 6. Corte opcional (orden de recorte del S5, punto 4)

- [ ] 6.1 DIFERIDA -> H-2 (el humano decide el recorte P-3; no se activó, no aplica) (solo si el humano activa el recorte, P-3) Sembrar 4 pacientes en lugar de 7: (g) mama inicial, (k) mama
  HER2+ tras T-DM1, (l) próstata sensible y (m) próstata resistente (mantienen AC-2…AC-5: (g) y (l) con faltantes
  distintos, (k) sin faltantes). Se omiten (h), (i), (j) y sus 3 pares de ejemplos; el conteo esperado pasa a 10
  pacientes semilla. Exige reescribir el AC-1 de US-254 en `backlog/features/FEAT-06c-corpus-cientifico.md` (Markdown
  primero, Linear después) y los escenarios de `specs/data-model` y `specs/demo-install` antes del commit; los tres
  pacientes omitidos pasan a una historia hija. Si no se activa: DIFERIDA -> L1D-310 (no aplica).
