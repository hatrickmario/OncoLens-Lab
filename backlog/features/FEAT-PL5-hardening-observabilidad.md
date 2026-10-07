# FEAT-PL5 — Hardening mínimo y observabilidad operable

> Linear: [L1D-33](https://linear.app/l1der-lab-mjbc/issue/L1D-33)

**Talla:** L (3 historias de desarrollo en S6 + 1 ADR Post-MVP) · **Sprint:** 6 (`si-hay-capacidad`: US-183, US-184, US-185) · Post-MVP (US-028 · ADR-44) · **Label:** `si-hay-capacidad` · **Capacidad:** T-4 (AC-T4.1: §11 #3 *mutation testing*) · T-1 (trazabilidad operativa) · **Recorrido principal:** no
**Requisitos:** NFR-10 (100 % en el S6) · G-10 (`/health` y `/metrics` en todos los servicios; `traceId` en el 100 % de las requests; *mutation score* ≥ 70 % sobre auth, autorización y cifrado) · IA-11 (métricas de tokens y latencia por etapa) · SEG-03 (*mutation* ≥ 70 %) · V-08 (ADR-44)
**Evidencia:** [→ PRD §2.1 G-10], [→ PRD §7 NFR (observabilidad)], [→ PRD §11 #3], [→ PRD §12 Operación], [→ PRD §13 Unitarias y Seguridad (*mutation testing*)], [→ PRD §14 S6], [→ readme §2.6 (StrykerJS)], [→ readme §2.7 Observabilidad], [→ readme §5.0 S6 KR1…KR3], [→ backlog/02-adrs.md US-028 · ADR-44, §4.6]
**Dependencias:** ↪ US-034 (Compose y redes), US-037 (logs JSON con `traceId` y configuración), US-044, US-045, US-046 (código sobre el que corre *mutation*), US-056 (semáforo y cola de inferencia), US-036 (CI) · 🔗 Regresión [RN-10] → US-046 (nada de identidad en métricas ni trazas) · 🔗 Regresión [SEG-09] → US-034 (ningún puerto nuevo publicado)
**Valor:** con datos reales en el piloto, Ingeniería tiene que diagnosticar un análisis lento o un documento colgado sin abrir el código ni la base, y demostrar que los controles de acceso y cifrado están probados de verdad y no solo cubiertos.
**Workaround en el MVP:** logs JSON con `traceId` propagado por `X-Trace-Id` (US-037), `/health` en ambos backends (US-034) y la latencia por etapa que ya mide la suite de evaluación (US-073, US-141); los reportes de la suite sustituyen a `/metrics` hasta el S6. Sin Prometheus, Grafana ni OpenTelemetry (ADR-44, Post-MVP).
**Stories:** US-183, US-184, US-185 (11 puntos, S6 `si-hay-capacidad`) · US-028 · ADR-44 (3 puntos, Post-MVP)

---

## US-183 — `/metrics` expone en los tres servicios la latencia, los errores y las métricas de IA por etapa, sin datos personales ni puertos nuevos

> Linear: [L1D-175](https://linear.app/l1der-lab-mjbc/issue/L1D-175)

`FEAT-PL5` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · — (técnica, PRD §17) · NFR-10, IA-11, G-10 · AC-T4.1 (§11 #9 red) · ↪ US-034, US-037, US-056 · 🔗 Regresión [RN-10] → US-046

## Story
Como responsable técnico, quiero que `web`, `clinical-api` y `rag-orchestrator` expongan
`/health` y `/metrics` con las métricas de readme §2.7, para ver en el piloto dónde se va
el tiempo de un análisis y qué se acumula en las colas.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el stack en Compose tras un análisis con adapters falsos,
  cuando se lee `/metrics` de `rag-orchestrator` desde la red interna, entonces incluye
  histogramas de duración de expansión, recuperación, *rerank*, generación y NLI,
  contadores de afirmaciones descartadas y omitidas, tokens por consulta y longitud de la
  cola de inferencia. `[NFR-10]` `[IA-11]` `[readme §2.7]`
- **AC-2 (borde · tres servicios)** · Dado el stack, cuando el test de humo recorre los
  servicios, entonces `web`, `clinical-api` y `rag-orchestrator` responden `200` en
  `/health` y `/metrics` en formato Prometheus, y `clinical-api` expone documentos en
  cuarentena, pendientes de revisión y tiempo de OCR. `[G-10]` `[readme §5.0 S6 KR1]`
- **AC-3 (invariante · sin datos personales)** · Dado `/metrics` tras el recorrido de
  FX-T4a-a (PII sembrada), cuando se inspecciona, entonces ninguna etiqueta contiene UUID
  de paciente, identidad, texto de la pregunta ni nombres de documentos (cardinalidad
  acotada: servicio, ruta, etapa, código). `[RN-10]` `[NFR-11]`
- **AC-4 (borde · red)** · Dado `docker compose config`, cuando se inspeccionan los
  puertos publicados, entonces solo `web` publica un puerto y `/metrics` de `web` exige
  sesión de `admin` o red interna. `[SEG-09]` (asumido en el acceso a `/metrics` de `web`)
- **AC-5 (borde · LLM caído)** · Dado el LLM nativo detenido, cuando se lee `/health` de
  `rag-orchestrator`, entonces responde `503` con `LOCAL_LLM_UNAVAILABLE` y `/metrics`
  sigue respondiendo `200`. `[readme §2.7]`

## Contexto técnico
`prom-client` en Node y `prometheus-client` en Python; métricas de agente (sub-consultas,
*deadline*) se registran vacías hasta FEAT-08c. Ninguna etiqueta toma valores del
dominio clínico. Tests: test de humo en Compose (AC-2, AC-5), test que parsea `/metrics`
con PII sembrada (AC-3) e inspección de `docker compose config` en CI (AC-4).

## INVEST
**Small** ✓ instrumentación con librerías estándar en tres servicios.
**Testable** ✓ cinco tests automatizados.

---

## US-184 — El 100 % de las requests lleva un `traceId` que se correlaciona de `web` a `rag-orchestrator`

> Linear: [L1D-176](https://linear.app/l1der-lab-mjbc/issue/L1D-176)

`FEAT-PL5` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · — (técnica, PRD §17) · NFR-10, G-10 · ↪ US-037, US-060, US-054 · 🔗 Regresión [RN-10] → US-046

## Story
Como responsable técnico, quiero seguir cualquier request del navegador hasta el
orquestador con un único `traceId`, para diagnosticar un fallo del piloto leyendo los
logs de los tres servicios.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un análisis lanzado desde el navegador en Playwright
  contra Compose, cuando se recogen los logs de los tres servicios, entonces todas las
  líneas de esa request comparten el mismo `traceId`, que también trae la respuesta
  (`EvidenceAnalysis.traceId`) y `AIAnalysisRecord.trace_id`. `[NFR-10]` `[G-10]`
- **AC-2 (borde · cobertura)** · Dado el recorrido E2E completo (`g-demo.spec.ts`), cuando
  se analizan los logs, entonces el 100 % de las líneas de request tiene `traceId`; una
  línea sin él hace fallar el test. `[readme §5.0 S6 KR2]`
- **AC-3 (borde · cabecera hostil)** · Dada una request con `X-Trace-Id` de 10 KB o con
  caracteres de control, cuando llega a `web`, entonces se descarta y se genera uno nuevo
  con el formato configurado. (asumido)
- **AC-4 (borde · worker)** · Dada una extracción procesada por el worker, cuando se leen
  los logs, entonces el `traceId` de la carga original aparece en la llamada a
  `/documents/extract`. `[readme §2.7]` (asumido en la propagación por la cola)
- **AC-5 (invariante · sin PHI)** · Dadas las líneas del AC-1, cuando se escanean con el
  detector de PII, entonces no contienen identidad, texto de la pregunta ni contenido de
  documentos. `[RN-10]` `[NFR-11]`

## Contexto técnico
Middleware de `traceId` en `web` (Route Handlers) y en ambos backends (US-037 ya lo hace
en `clinical-api`); el worker guarda el `traceId` en la fila de `Document` al encolar.
Tests: Playwright + recolector de logs de Compose (AC-1, AC-2, AC-4), Supertest (AC-3) y
el detector de US-013 (AC-5).

## INVEST
**Small** ✓ propagación de una cabecera en tres servicios y la cola.
**Testable** ✓ cinco tests.

---

## US-185 — StrykerJS alcanza un *mutation score* ≥ 70 % sobre auth, autorización y cifrado, y la CI lo exige

> Linear: [L1D-177](https://linear.app/l1der-lab-mjbc/issue/L1D-177)

`FEAT-PL5` · Sprint 6 (`si-hay-capacidad`) · Estimación **5** · — (técnica, PRD §17) · G-10, SEG-03 · AC-T4.1 (§11 #3) · ↪ US-044, US-045, US-046, US-036

## Story
Como responsable técnico, quiero comprobar con *mutation testing* que los tests de
sesión, permisos y cifrado detectan cambios reales en el código, para confiar en los
controles que protegen datos reales.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `stryker.conf` con alcance `src/modules/{auth,users,
  identity}/**` y el *guard* de RBAC, cuando corre `npx stryker run`, entonces el
  *mutation score* es ≥ `MUTATION_SCORE_MIN` (0,70) y el reporte HTML queda como artefacto
  de la CI. `[G-10]` `[SEG-03]` `[readme §5.0 S6 KR3]`
- **AC-2 (borde · regresión)** · Dado un PR que elimina el test de bloqueo tras 5
  intentos, cuando corre la CI, entonces el *score* cae por debajo del mínimo y el
  *check* falla. `[G-10]`
- **AC-3 (borde · mutantes sobrevivientes críticos)** · Dado un mutante que cambia la
  comparación del índice ciego HMAC o el modo de AES-GCM y sobrevive, cuando termina,
  entonces el reporte lo lista en "críticos" y la CI falla aunque el *score* global sea
  ≥ 0,70. `[RN-10]` `[SEG-03]` (asumido en la regla de críticos)
- **AC-4 (borde · tiempo de CI)** · Dado un PR que no toca el alcance de Stryker, cuando
  corre la CI, entonces Stryker corre en modo incremental y no supera
  `MUTATION_CI_TIMEOUT_MIN`. (asumido)

## Contexto técnico
StrykerJS con el *runner* de Vitest en `apps/clinical-api`; el umbral y los ficheros
críticos viven en configuración `[RN-22]`. Tests: la propia ejecución en CI (AC-1, AC-4)
y dos PR de prueba (AC-2, AC-3).

## INVEST
**Small** ✓ una herramienta sobre tests existentes; el esfuerzo es reforzar tests débiles.
**Testable** ✓ el *score* y los críticos son salidas verificables.
*(Estimable ⚠ el 5 asume que los tests de US-044…US-046 ya son sólidos; si el primer
*score* sale muy bajo, dividir por módulo.)*

---

## US-028 · ADR-44 — Stack de observabilidad: métricas, paneles y *tracing* distribuido

> Linear: [L1D-178](https://linear.app/l1der-lab-mjbc/issue/L1D-178)

`FEAT-PL5` · Post-MVP · Estimación **3** · — (ADR) · V-08 · G-10, NFR-10 · Dueño: Ingeniería · **Recorrido principal:** no · **Workaround en el MVP:** logs JSON con `traceId` (`X-Trace-Id`) + `/metrics` en formato Prometheus leído a mano o por script (US-183, US-184), sin Prometheus, Grafana ni OpenTelemetry · ⛔ Bloqueada por: — (las métricas `/metrics` y los logs JSON con `traceId` ya están decididos) · 🔗 Bloquea: paneles, *tracing* y alertas (Post-MVP)

## Story
Como responsable técnico, quiero decidir qué stack consume `/metrics` y si se agrega
*tracing* distribuido, para que la observabilidad crezca sin romper el presupuesto de
memoria ni filtrar datos clínicos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dadas las opciones, cuando se decida, entonces
  `docs/architecture/adr/ADR-44-observabilidad.md` registra la memoria adicional medida de
  cada una y la elegida cabe en el presupuesto de 24 GB junto con el stack de ADR-39.
  `[readme §1.4]`
- **AC-2 (borde · no fuga)** · Dado el *tracing* distribuido, cuando se especifique,
  entonces los atributos de los *spans* siguen la regla de los logs: nunca identidad,
  PHI, secretos, contenido ni URL de documentos; pacientes por UUID. `[CLAUDE.md]`
  `[RN-10]`
- **AC-3 (borde · red)** · Dada una interfaz de paneles, cuando se especifique su acceso,
  entonces no se publica al host ningún puerto de backend, y el acceso a la UI de paneles
  queda restringido (VPN o `localhost`) y justificado en el ADR. `[CLAUDE.md]` (asumido)
- **AC-4** · Dado el ADR aprobado, cuando se cierre, entonces lista las métricas de IA de
  readme §2.7 que deben verse en paneles (latencia por etapa, afirmaciones descartadas y
  omitidas, sub-consultas del agente, tokens, cola de inferencia, cuarentena).
  `[readme §2.7]`

## Contexto técnico
Historia de ADR (copiada de `backlog/02-adrs.md`). Opciones: A · solo `/metrics` + logs
JSON + `traceId` (estado tras US-183/US-184; cero memoria extra) · B · Prometheus +
Grafana en Compose (paneles y alertas; memoria y un puerto de UI que proteger) · C · B +
OpenTelemetry (trazas B1 → B2 → LLM; más memoria y riesgo de PHI en atributos).

## Non-goals
No instrumentar (eso es US-183/US-184). No cambiar el formato de logs ni la propagación
de `X-Trace-Id`.

## INVEST
**Small** ✓ una evaluación de tres opciones con medición de memoria.
**Testable** ✓ los AC verifican el contenido del ADR.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §7 NFR (observabilidad): "`/metrics` desde el Sprint 1 para las métricas de IA"; readme §2.7 | Slicing adoptado: `/metrics` completo en el S6 si hay capacidad (FEAT-PL1 entregó logs JSON, `traceId` y `/health` en el S1) | Slicing: las latencias por etapa del S1–S4 salen de los reportes de la suite (US-073, US-141); `/metrics` llega con US-183. Se registra para enmendar el PRD |
| — | PRD §14 S6 y readme §5.0 S6: observabilidad y hardening como objetivo del S6 | Slicing adoptado: el S6 prioriza la medición de valor (FEAT-T5d); el hardening es `si-hay-capacidad` | Slicing; el piloto con datos reales sigue siendo posible sin el S6 (readme §5.0, nota del S6) |
| V-08 | readme §2.7: "ADR futuro" de Prometheus/Grafana/OTel sin TBD | `backlog/02-adrs.md`: ADR-44 Post-MVP | ADR-44 (US-028) en Post-MVP |
