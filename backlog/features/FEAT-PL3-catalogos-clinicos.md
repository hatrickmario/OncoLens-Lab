# FEAT-PL3 — Catálogos clínicos versionados v1

> Linear: [L1D-32](https://linear.app/l1der-lab-mjbc/issue/L1D-32)

**Talla:** L · **Sprint:** 2 (US-041, US-043, US-018 · DEC-08) · `si-hay-capacidad` (US-042) · **Capacidad:** — (plataforma; la consumen CAP-02, CAP-03, CAP-04, CAP-05, CAP-08) · **Recorrido principal:** sí · no (US-042)
**Requisitos:** NFR-14 (dueña: montaje, versión, `409`) · RN-20 (dueña de la parte de configuración: `ENABLED_CANCER_TYPES` y `tipo_no_habilitado`) · RN-29 (validador mínimo del S1; dueña plena: FEAT-04 US-001) · RN-27 (fuente única de códigos) · Q-07 (solo estándares permitidos) · DEC-08
**Evidencia:** [→ PRD §7 NFR (catálogos clínicos)], [→ PRD §6 RN-20, RN-27, RN-29], [→ PRD §5 FR-04 (umbral de tendencia en el catálogo)], [→ PRD §16 TBD-13, TBD-17], [→ readme §3.3 #22, #29, #38], [→ readme §2.3 `packages/clinical-catalogs`], [→ readme §4.2 `/rag/query` 409], [→ readme §6 OL-02 AC (409)], [→ readme §6 OL-03 alcance complementario (`tipo_no_habilitado`)], [→ backlog/01-requisitos.md §10 V-12, V-16; §14 Q-07]
**Dependencias:** ↪ US-033 · ↪ US-037 (configuración) · ⛔ DEC-04 · workaround Q-07 (US-042 AC-4) · 🔗 Consumida por: US-039 (códigos del seed), US-052 (versión en el contexto), FEAT-04 US-001 (amplía el validador), FEAT-02b (tendencias) · 🔗 Relacionada: DEC-19 (criterio de "listo", S6)
**Valor:** el oncólogo necesita que las reglas clínicas (datos críticos, criterios de aplicabilidad, umbrales de tendencia, códigos) se puedan revisar y cambiar sin desplegar código y que ambos backends usen exactamente la misma versión; si no, el análisis mezclaría reglas distintas sin que nadie lo note. Además, ningún código de un estándar con términos de uso no confirmados puede quedar en un repositorio público.
**Workaround en el MVP (US-042):** US-001 (S4) publica el catálogo de datos críticos con su validador; hasta entonces el catálogo v1 se revisa en el PR.
**Stories:** US-041, US-043, US-018 · DEC-08 (9 puntos, S2) · US-042 (3 puntos, `si-hay-capacidad`)

---

## US-041 — El catálogo clínico v1 se monta en ambos backends y una versión distinta responde `409`

> Linear: [L1D-171](https://linear.app/l1der-lab-mjbc/issue/L1D-171)

`FEAT-PL3` · Sprint 2 · Estimación **5** · — (técnica, PRD §17) · NFR-14, RN-27 · ↪ US-033, US-037 · 🔗 Consumida por: US-039, US-052, US-055, FEAT-04 US-001

## Story
Como oncólogo, quiero que las reglas y los códigos clínicos vivan en un catálogo
versionado que ambos backends leen de la misma fuente, para que cada análisis quede
ligado a una versión conocida de las reglas y un desajuste nunca produzca un resultado
silenciosamente inconsistente.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `packages/clinical-catalogs` en la versión `1.0.0`
  montado de solo lectura en `clinical-api` y `rag-orchestrator` (`CLINICAL_CATALOG_PATH`,
  `CLINICAL_CATALOG_VERSION=1.0.0`), cuando se ejecuta un análisis sobre el paciente
  semilla (a), entonces la respuesta es `200` y el `AIAnalysisRecord` persistido tiene
  `catalog_version = "1.0.0"`. `[NFR-14]` `[ADR-38]` `[AC-T1.4]`
- **AC-2 (borde · versión distinta)** · Dado `rag-orchestrator` con el catálogo `1.0.0`
  y `clinical-api` con `1.0.1`, cuando se solicita un análisis, entonces
  `rag-orchestrator` responde `409 CATALOG_VERSION_MISMATCH`, `clinical-api` responde
  `409` con `{ error: "CATALOG_VERSION_MISMATCH" }`, el adapter del LLM registra cero
  invocaciones y no se persiste ningún `AIAnalysisRecord`. `[NFR-14]` `[OL-02]` `[ADR-38]`
- **AC-3 (borde · solo lectura)** · Dado el contenedor de `clinical-api` en marcha,
  cuando un proceso intenta escribir en `CLINICAL_CATALOG_PATH`, entonces la escritura
  falla con error de sistema de archivos de solo lectura. `[ADR-38]`
- **AC-4 (borde · cambiar reglas sin desplegar)** · Dada la misma imagen de
  `clinical-api`, cuando arranca con `CLINICAL_CATALOG_PATH` apuntando a la versión
  `1.0.1`, entonces `/health` informa `catalogVersion = "1.0.1"` sin reconstruir la
  imagen. `[NFR-14]` `[RN-22]`
- **AC-5 (borde · catálogo ausente)** · Dado `CLINICAL_CATALOG_PATH` apuntando a un
  directorio inexistente, cuando arranca cualquiera de los dos backends, entonces no
  queda listo (`/health` ≠ `200`) y el log registra el código de error sin el contenido
  del catálogo. (asumido)

## Contexto técnico
Estructura inicial (datos, no código, ADR-29): `manifest.json` (`version`,
`cancerTypes`, `standards`), `mama/` y `prostata/` con `codigos.json` (subconjunto
CIE-10 del S1), `sinonimos.json` (ES/EN), `tendencias.json` (umbral por biomarcador,
estado `propuesta` hasta DEC-08) y archivos vacíos con esquema para
`datos-criticos.json`, `aplicabilidad.json` y `plantillas.json` (los llenan FEAT-04,
FEAT-08b y FEAT-05). El gateway envía `catalogVersion` en `RagQueryInternalRequest` y
traduce el `409` interno a `409` público (no a `502`). AC-1 y AC-2: Supertest con
`rag-orchestrator` real en modo test y LLM falso, más Pytest del endpoint; AC-3 a AC-5:
tests de arranque en contenedor (smoke de Compose).

## Non-goals
Validación de contenido (US-042). Contenido de datos críticos (FEAT-04), aplicabilidad
(FEAT-08b) y plantillas (FEAT-05).

## INVEST
**Small** ✓ estructura de paquete, montaje y un chequeo de versión en ambos lados.
**Testable** ✓ dos tests de integración y tres de arranque.

---

## US-042 — El validador mínimo impide publicar un catálogo con ítems sin destino o con estándares no permitidos

> Linear: [L1D-172](https://linear.app/l1der-lab-mjbc/issue/L1D-172)

`FEAT-PL3` · Sprint si-hay-capacidad · Estimación **3** · — (técnica, PRD §17) · RN-29 (mínimo del S1), RN-27, SEG-12 · ↪ US-041, US-038 · ⛔ DEC-04 · workaround Q-07 (AC-4) · 🔗 Relacionada: FEAT-04 US-001 (dueña de RN-29; construye el validador del catálogo en el S4) · **Recorrido principal:** no · **Workaround en el MVP:** US-001 (S4) publica el catálogo de datos críticos con su validador; hasta entonces el catálogo v1 se revisa en el PR

## Story
Como oncólogo, quiero que un catálogo con un ítem que no apunta a un campo real del
modelo, o con códigos de un estándar sin permiso confirmado, no pueda publicarse, para
que desde el S1 ninguna regla pida un dato que el sistema no puede guardar y el
repositorio público no exponga códigos no autorizados.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el catálogo `1.0.0` de US-041, cuando se ejecuta
  `npm run catalog:validate`, entonces termina con código 0. `[RN-29]`
- **AC-2 (borde · ítem sin destino)** · Dada una copia del catálogo en la que un umbral
  de `tendencias.json` referencia el biomarcador `PSA` sin `destination`, cuando se
  ejecuta `catalog:validate`, entonces termina con código ≠ 0 y el mensaje nombra la
  clave del ítem. `[RN-29]` `[V-12]`
- **AC-3 (borde · destino inexistente)** · Dado un ítem cuyo `destination` apunta a
  `Diagnosis.menopause` (campo que no existe en el esquema Prisma), cuando se ejecuta
  `catalog:validate`, entonces termina con código ≠ 0 y nombra el ítem. `[RN-29]`
- **AC-4 (borde · estándar no permitido, Q-07)** · Dado `manifest.json` con
  `allowedStandards = ["CIE-10"]` (DEC-04 sin cerrar) y un archivo que agrega códigos
  LOINC, cuando corre `catalog:validate` en la CI, entonces termina con código ≠ 0 y
  nombra el estándar. `[Q-07]` `[TBD-17]` `[SEG-12]`
- **AC-5 (borde · CI y arranque)** · Dado un catálogo que no pasa la validación, cuando
  se abre un PR o arranca `clinical-api` con él, entonces la CI falla y el servicio no
  queda listo. `[RN-29]` (asumido)

## Contexto técnico
Validador en `packages/clinical-catalogs/scripts/validate.ts`: JSON Schema por archivo
más comprobación de `destination` contra una **allowlist generada del esquema Prisma**
(DMMF), no escrita a mano, para que un cambio de modelo rompa la validación (mismo
diseño que FEAT-04 US-001, que lo extiende con condiciones y datos críticos). La lista
`allowedStandards` sale de DEC-04 (US-010 AC-4). Tests unitarios con Vitest sobre
fixtures de catálogo válidos e inválidos en `packages/clinical-catalogs/test/fixtures/`.

## Non-goals
Reglas condicionales, matriz ítem → campo de datos críticos y firma (FEAT-04, S3). Que
el catálogo esté "listo" para un tipo de cáncer (DEC-19, S5).

## INVEST
**Small** ✓ un validador de esquema con una allowlist generada.
**Testable** ✓ cinco tests sobre fixtures de catálogo y un job de CI.

---

## US-043 — Solo los tipos de cáncer habilitados se analizan; el resto responde `tipo_no_habilitado` sin invocar a la IA

> Linear: [L1D-173](https://linear.app/l1der-lab-mjbc/issue/L1D-173)

`FEAT-PL3` · Sprint 2 · Estimación **3** · HU-03 · RN-20 (dueña de la configuración), FR-04, FR-09 · AC-06.1 (`tipo_no_habilitado`) · ↪ US-037, US-041, US-052, US-033 (AC-9: `422` de Backend 2 en el contrato) · 🔗 Relacionada: DEC-19 (criterio de "listo", S6)

## Story
Como oncólogo, quiero que el sistema me diga claramente cuándo el tipo de cáncer de mi
paciente está fuera del alcance del piloto, para no recibir un análisis sobre evidencia
y reglas que nadie ha preparado para ese tipo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `ENABLED_CANCER_TYPES=mama,prostata` y el paciente
  semilla (a), cuando consulto su ficha, entonces `cancerTypeEnabled = true`. `[FR-04]` `[RN-20]`
- **AC-2 (borde · tipo no habilitado en el análisis)** · Dado
  `ENABLED_CANCER_TYPES=mama` y el paciente semilla (b) (próstata), cuando solicito un
  análisis, entonces la respuesta es `200` con `status = "tipo_no_habilitado"`,
  `evidenceOptions = []`, `topRelevanceScore = null`, el cliente de `rag-orchestrator`
  registra cero llamadas y se persiste un `AIAnalysisRecord` con ese estado.
  `[RN-20]` `[FR-09]` `[AC-06.1]` `[readme §4.1]`
- **AC-3 (borde · ficha)** · Dado el mismo escenario del AC-2, cuando consulto la ficha
  del paciente (b), entonces `cancerTypeEnabled = false` y la página muestra "Tipo de
  cáncer fuera del alcance del piloto" sin ocultar los datos del paciente. `[FR-04]`
- **AC-4 (borde · defensa en Backend 2)** · Dado `rag-orchestrator` con
  `ENABLED_CANCER_TYPES=mama`, la misma versión de `packages/clinical-catalogs` montada
  en ambos backends y un `RagQueryInternalRequest` cuyo
  `clinicalContext.diagnosis.cancerType` es `prostata`, cuando lo recibe, entonces
  responde `422` con `error = "TIPO_NO_HABILITADO"` y el adapter del LLM registra cero
  invocaciones; el enum interno de `status` no cambia (`con_evidencia | sin_evidencia`).
  `[RN-20]` `[§15 resp. 3]`
- **AC-5 (borde · configuración vacía)** · Dado `ENABLED_CANCER_TYPES` vacío o con un
  tipo que no existe en `manifest.json` del catálogo, cuando arranca `clinical-api`,
  entonces no queda listo y el log nombra el valor inválido. `[RN-22]` (asumido)

## Contexto técnico
`ENABLED_CANCER_TYPES` se lee en ambos backends (US-037). El gateway comprueba el tipo
del `Diagnosis` activo **antes** de construir el contexto y responde sin llamar a
Backend 2 (readme §6 OL-03, alcance complementario). Backend 2 repite la comprobación
como defensa en profundidad con el mismo catálogo montado (respuesta 3 del usuario,
`01-requisitos.md` §15): si un tipo no habilitado le llega, responde `422`. El registro persistido lleva
`analysis_basis` con los incisos del S1 (US-066). AC-1 a AC-3: Supertest y Playwright
contra Compose con el seed; AC-4: Pytest con adapters falsos; AC-5: test de arranque.

> Pendiente de definir en refinamiento (dueño: DEC-19 · afecta: nada en el S1): RN-20 exige el criterio de "listo" para habilitar un tipo, pero mama y próstata se habilitan desde el S1 con corpus semilla y catálogo `propuesta` (V-16). Escenario más probable de DEC-19: el criterio aplica como prerrequisito de G-Piloto, no de la demo sintética.

## INVEST
**Small** ✓ una comprobación en el gateway, un campo en la ficha y una defensa en Backend 2.
**Testable** ✓ cinco tests de integración, E2E y arranque.

---

## US-018 · DEC-08 — Umbrales de tendencia por biomarcador

> Linear: [L1D-174](https://linear.app/l1der-lab-mjbc/issue/L1D-174)

`FEAT-PL3` · Sprint 2 · Estimación **1** · — (decisión) · FR-04 · TBD-13 (tendencias), R-24 · Dueño: oncólogo asesor · 🔗 Bloquea: FEAT-02b (cálculo de la tendencia ↑ ↓ = en ficha, vista de caso y contexto, US-091)

## Story
Como oncólogo asesor, quiero validar el umbral de cambio de cada biomarcador del
catálogo, para que "=" (estable) signifique un cambio clínicamente menor y no una
diferencia numérica arbitraria.

> Escenario más probable (a refinar en sprint planning): Ingeniería propone un umbral por biomarcador del catálogo de mama y próstata en `tendencias.json` y el oncólogo lo revisa como parte de `packages/clinical-catalogs`, porque FR-04 ya ubica el umbral en el catálogo. Por P-03, la revisión no requiere una sesión de firma formal: el archivo pasa de `propuesta` a `revisado` con fecha y revisor.

## AC (Given/When/Then)
- **AC-1** · Dada la propuesta, cuando el oncólogo la revise, entonces la versión del
  catálogo publicada lleva un bloque `validation` con alcance `tendencias`, revisor y
  fecha (patrón de DEC-01). `[FR-04]` (asumido)
- **AC-2** · Dado un biomarcador sin umbral revisado, cuando se registre, entonces queda
  marcado `propuesta` y la decisión lo lista. (asumido)
- **AC-3** · Dada la revisión, cuando se registre, entonces cada umbral indica unidad y
  si es absoluto o relativo. (asumido)
- **AC-4** · Dada la versión del catálogo con los umbrales revisados, cuando se ejecuta
  `catalog:validate`, entonces termina con código 0 y cada umbral apunta a un
  biomarcador con destino en el modelo. `[RN-29]`

## Contexto técnico
Historia de decisión: el registro vive en el propio catálogo (`tendencias.json` y su
bloque `validation`), que valida US-042. La mecánica del cálculo de tendencia es de
FEAT-02b (S2).

## INVEST
**Small** ✓ una revisión de una tabla corta con el oncólogo.
**Testable** ✓ `catalog:validate` comprueba el bloque `validation` y el estado de cada umbral.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-21 | readme §5.0 S1 y OL-01: catálogo con CIE-10, LOINC y ATC desde el S1 | PRD TBD-17 y decisión Q-07 | Q-07: `allowedStandards = ["CIE-10"]` hasta cerrar DEC-04 (US-042 AC-4) |
| V-12 | readme §3.3 #29 y PRD §14: validador de RN-29 con FEAT-04 en el S3 | El catálogo existe y se consume desde el S1 | Validador mínimo en el S1 (US-042); FEAT-04 US-001 lo amplía y sigue siendo la dueña de RN-29 |
| — | PRD §7: "Backend 2 rechaza con `409` una versión distinta" (no dice qué responde `clinical-api`) | readme OL-03: mapeo de errores de Backend 2 a `502` | Se propaga `409` al cliente (no es un error de comunicación sino de configuración visible; regla del encargo: "si difieren, el análisis responde `409`") |
| Slicing v2 | readme §5.0 S1 y OL-01: catálogo clínico v1 montado en ambos backends desde el S1; validador mínimo RN-29 en el S1 (lote 1) | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): catálogo y tipos habilitados en el S2; validador mínimo `si-hay-capacidad` | El S1 usa el subconjunto CIE-10 del catálogo como datos del seed; montaje, `409` y `tipo_no_habilitado` llegan en el S2; RN-29 la verifica US-001 en el S4 |
