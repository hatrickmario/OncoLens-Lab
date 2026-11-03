# Tasks — l1d-310-pacientes-momentos-enfermedad

> ↪ `l1d-80-tratamientos-atributos-manuales` (listas de `setting` y `values` de atributos en `atributos.json` 1.2.0 / manifest 1.4.0, con `sensible_castracion`; subconjunto ATC real) antes de fijar los valores
> de §2.2; ↪ `l1d-74-vista-caso-timeline` (`GET …/case`) antes de la tarea 2.6 (AC-2). 🔗 `l1d-309` toca `sembrar.ts`
> (notas de (a)): conflicto trivial, orden de PR. Matriz TDD (CLAUDE.md): seed, datos, scripts y guía → **test
> después** (el test va en el mismo PR); la regla `historiaCoherente()` es lógica pura con su unitario; ejemplos →
> `contracts:check`. Integración con PostgreSQL real; nunca `vi.mock` de módulos propios ni de Prisma; reloj del seed
> inyectado (`relojDelSeed`), IDs con `idSembrado`; nunca `.skip`/`.only`/`it.todo`. Solo datos sintéticos.

## 1. contratos

- [ ] 1.1 (test después: ejemplos) Escribir los 7 pares `contracts/examples/rag-query-request-demo-s5-<paciente>.json`
  (`RagQueryInternalRequest`, `patientContext` desidentificado coherente con el paciente: seudónimo, fechas relativas)
  y `rag-query-demo-s5-<paciente>.json` (`RagQueryInternalResponse`, `con_evidencia`, `optionsNotShown = 0`, citas a
  `chunkId` existentes del corpus de la demo, `applicabilitySummary` según `design.md` D6, lenguaje no prescriptivo,
  RN-23) y registrarlos en `index.json` con su `request`. Preguntas exactas distintas entre sí y de las del S4.
  `contracts:check` en verde; `contracts:breaking` sin diferencias (no cambia ningún `openapi.yaml`). Commit
  `contract(L1D-310)`.
- [ ] 1.2 (test después) Ampliar `apps/rag-orchestrator/tests/unit/test_fake_evidence_query.py`: «carga los ejemplos
  demo-s5 y cada pregunta selecciona su respuesta con_evidencia [US-254 AC-4]» (sin tocar código de `rag-orchestrator`).

## 2. clinical-platform

- [ ] 2.1 (test después: tipos del seed) `pacientes/tipos.ts`: `TratamientoPreviaSemilla.fin?` y
  `EventoSemilla.tipo` ampliado (D2); `sembrar.ts` escribe `ended_at`, `ongoing = false`, `end_reason` y el
  `prior_treatment_id` del evento de progresión que cierra una línea; exporta `PACIENTES_SEMILLA`. (a)–(e) sin cambios
  (los tests de contenido de US-039 AC-2 siguen en verde).
- [ ] 2.2 (test después: datos) Ficheros `pacientes/{f,g,h,i,j,k,l}.ts` con el contenido de `design.md` D1, términos
  canónicos y biomarcadores con los nombres del catálogo de datos críticos; valores de atributos y `setting` de las
  listas de `l1d-80` (D6/D7; (k) con `sensible_castracion`, decidido; deprivación androgénica = leuprorelina `L02AE02`, solo ATC reales del subconjunto de `l1d-80`); añadirlos al final de `PACIENTES_SEMILLA` (ordinales 6–12);
  actualizar el comentario de `identidades.ts`.
- [ ] 2.3 (TDD: regla pura) Extraer `historiaCoherente()` (D3) en `pacientes/coherencia.ts`: unitarios uno a uno
  (línea antes del diagnóstico, fin antes del inicio, solape con la línea siguiente, hueco en la numeración, evento
  antes del diagnóstico, fecha futura) y test «los 12 pacientes semilla tienen una historia coherente [US-254 AC-2]»
  y «detecta la línea 2 de (j) que empieza antes del fin de la línea 1 [US-254 AC-2]».
- [ ] 2.4 (test después: seed, integración) Test de conteos del seed `tests/integration/seed/momentos-enfermedad.test.ts`:
  «carga los 7 pacientes nuevos con su tipo de cáncer y 12 pacientes semilla [US-254 AC-1]», «(j) tiene trastuzumab,
  pertuzumab y trastuzumab emtansina por línea; (k) sensible y (l) resistente_castracion [US-254 AC-1]», «un régimen
  sin ATC en el catálogo queda no_mapeado [US-254 AC-1]», «ids deterministas e idempotentes e identidades
  SINT-0000006…12 [US-254 AC-5]», «en piloto no escribe ninguna fila de (a)–(l) [US-254 AC-5]». Tiempo máximo
  explícito si arranca procesos.
- [ ] 2.5 (test después) Una sola fuente del número de pacientes (D5): `listado.test.ts`, `orden.test.ts`,
  `contrasenas-e-idempotencia.test.ts`, `identidades.test.ts`, `indice-ciego-del-nombre.test.ts`, `contenido.test.ts`
  y `tests/support/pacientes.ts` leen `PACIENTES_SEMILLA.length` (el escenario «El seed escribe cinco identidades
  cifradas» pasa a «= pacientes semilla»); revisar que `PAGE_SIZE_DE_TEST` siga dando más de una página. Ningún test se
  quita ni se relaja.
- [ ] 2.6 (test después: integración, ↪ `l1d-74`) «GET /case de cada paciente nuevo trae priorTreatments por línea y
  sus eventos en orden cronológico, validado contra el spec [US-254 AC-2]» (Supertest + PostgreSQL real con el seed).
- [ ] 2.7 (test después: integración) «(f) y (k) tienen faltantes distintos y no vacíos y (j) ninguno, sin bloquear la
  ficha [US-254 AC-3]» con el servicio de completitud y el catálogo real; el test imprime la lista que se copia a la
  guía (§2.10).
- [ ] 2.8 (test después: verificación del seed) `contar.ts` suma `clinical.prior_treatment`, `clinical.clinical_event`
  y `clinical.clinical_attribute` (`count(*)`); `verificar-conteos.py` los compara como mínimos (D4). Tests:
  `tests/unit/seed-contar.test.ts` y `scripts/demo/__tests__/levantar.test.mjs` («falla nombrando
  clinical.prior_treatment cuando hay menos de los publicados [US-254 AC-5]», «pasa con un tratamiento manual de más
  [US-254 AC-5]»); el humo existente de 0 identidades sigue en verde.
- [ ] 2.9 (test después: humo) `levantar.sh` desde cero imprime en «Verificación del seed» `esperado=12 obtenido=12`
  para pacientes e identidades y los tres mínimos nuevos; salida sin cadena de conexión ni contraseñas (privacy P2).
  Evidencia en el PR (salida recortada) [US-254 AC-5].
- [ ] 2.10 (test después: guía) `docs/demo/guia-demo-S5.md`, sección «Pacientes en distintos momentos de la
  enfermedad»: tabla por paciente (momento, historia resumida, faltantes calculados en 2.7, pregunta sugerida exacta) y
  bloque `<!-- conteos-demo-s5:inicio -->`/`fin` con los conteos por opción y `poblacionNoComparable`; enlace a
  `runbook-demo-S1.md` y nota «solo modo fingido; en vivo los estados los calculan las reglas».
- [ ] 2.11 (test después: E2E) `apps/web/e2e/demo-s5-pacientes.spec.ts` (patrón de `demo-s4-pares.spec.ts`): lee el
  bloque de la guía, comprueba que los ejemplos fijos coinciden con él y, contra Compose con `LLM_PROVIDER=fake`, que
  cada paciente (f)–(l) con su pregunta devuelve esos conteos y la marca de no comparable [US-254 AC-4]. Actualizar
  `apps/web/e2e/pacientes-listado.spec.ts` (US-048 AC-1) para que no dependa de «cinco». `setTimeout` explícito.
- [ ] 2.12 (test después: CI) Comprobar en el PR que los jobs de escaneo de secretos (gitleaks) y de PII (data-scan)
  pasan sin hallazgos con los ficheros nuevos [US-254 AC-5].
- [ ] 2.13 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
  antes y después, commit `refactor(L1D-310)`.

## 3. evaluación

- [ ] 3.1 No aplica `run-ai-eval`: no cambia modelo, prompt, umbral, catálogo ni corpus (los ejemplos fingidos no
  entran en `evaluate`). Anotarlo en el PR.

## 4. humano

- [ ] H-1 Comprobar que `l1d-80` ya añadió «sensible a la castración» (`sensible_castracion`) en `estado_castracion`
  (P-1 decidido, `[S5 resp. 13]`; también para (b)) antes del merge de este change. DIFERIDA -> H-1
- [ ] H-2 Ensayo de la demo: `levantar.sh` desde cero y recorrido de (f)–(l) en la vista de caso (US-142, G-Demo).
  DIFERIDA -> H-2

## 5. Verificación

- [ ] 5.1 `openspec validate l1d-310-pacientes-momentos-enfermedad --strict` en verde.
- [ ] 5.2 Tests de `clinical-api` (unit + integración), `scripts/demo/__tests__`, el test del fake de
  `rag-orchestrator` y el E2E de la demo en verde; `contracts:check` en verde (sin `contracts:verify-provider`: no
  cambia la API).

## 6. Corte opcional (orden de recorte del S5, punto 4)

- [ ] 6.1 (solo si el humano activa el recorte, P-3) Sembrar 4 pacientes en lugar de 7: (f) mama inicial, (j) mama
  HER2+ tras T-DM1, (k) próstata sensible y (l) próstata resistente (mantienen AC-2…AC-5: (f) y (k) con faltantes
  distintos, (j) sin faltantes). Se omiten (g), (h), (i) y sus 3 pares de ejemplos; el conteo esperado pasa a 9
  pacientes semilla. Exige reescribir el AC-1 de US-254 en `backlog/features/FEAT-06c-corpus-cientifico.md` (Markdown
  primero, Linear después) y los escenarios de `specs/data-model` y `specs/demo-install` antes del commit; los tres
  pacientes omitidos pasan a una historia hija. Si no se activa: DIFERIDA -> L1D-310 (no aplica).
