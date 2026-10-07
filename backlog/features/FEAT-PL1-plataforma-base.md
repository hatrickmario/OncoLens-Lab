# FEAT-PL1 — Plataforma base: monorepo, Compose, secretos, CI y configuración

> Linear: [L1D-30](https://linear.app/l1der-lab-mjbc/issue/L1D-30)

**Talla:** L · **Sprint:** 1 (US-034…US-036) · 2 (US-037) · **Capacidad:** — (plataforma) · T-4 (SEG-09, SEG-12) · T-5 (DoD de la CI) · **Recorrido principal:** sí
**Requisitos:** RN-14 (dueña), RN-22 (dueña), RN-13 (guarda del S1; dueña del gate: US-143), NFR-05, NFR-10 (parte S1), NFR-13, SEG-07 (claves), SEG-08 (TLS hacia PostgreSQL), SEG-09, SEG-12
**Evidencia:** [→ PRD §6 RN-13, RN-14, RN-22], [→ PRD §7 NFR (hardware, observabilidad, mantenibilidad)], [→ PRD §11 #7, #8, #9, #12], [→ readme §1.4 Pasos 2–5], [→ readme §2.3], [→ readme §2.4], [→ readme §2.6 Contract testing], [→ readme §2.7], [→ readme §6.0 Definition of Done], [→ CLAUDE.md "Comandos", "Datos y repositorio público"]
**Dependencias:** ↪ US-033 (specs que la CI valida) · 🔗 Bloquea: todas las Features del S1 (entorno común) · ⛔ ADR-39 solo para los valores de runtime (`LLM_BASE_URL`, `LLM_MODEL`) y el presupuesto de memoria, que se configuran, no se codifican
**Valor:** sin un entorno reproducible no hay walking skeleton demostrable al oncólogo. Esta Feature fija desde el día uno las reglas que no se pueden arreglar después en un repositorio público: ningún secreto ni dato real versionado, solo `web` expuesto, la IA aislada de los datos clínicos por red, y todo valor "a calibrar" en configuración, para que el oncólogo pueda ajustar umbrales sin desplegar código.
**Stories:** US-034, US-035, US-036 (13 puntos, S1) · US-037 (3 puntos, S2)

---

## US-034 — El stack levanta con Compose y solo `web` publica un puerto

> Linear: [L1D-164](https://linear.app/l1der-lab-mjbc/issue/L1D-164)

`FEAT-PL1` · Sprint 1 · Estimación **5** · — (técnica, PRD §17) · SEG-09, NFR-05, NFR-10 · ↪ US-035

## Story
Como equipo de desarrollo, quiero levantar todo el stack con un único comando de
Docker Compose y con el LLM nativo fuera de Docker, para que cualquier demo o test E2E
corra igual en la MacBook de referencia y los backends nunca queden expuestos al host.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `infra/docker/docker-compose.yml` y los secretos
  generados por US-035, cuando se ejecuta `docker compose -f infra/docker/docker-compose.yml up -d`,
  entonces `postgres`, `clinical-minio`, `milvus-standalone` (con `milvus-etcd` y
  `milvus-minio`), `clinical-api`, `rag-orchestrator` y `web` quedan `healthy` y
  `GET /health` de `clinical-api` y de `rag-orchestrator` responde `200` desde la red
  interna. `[readme §2.4]` `[readme §2.7]`
- **AC-2 (borde · puertos)** · Dado el Compose resuelto (`docker compose config`), cuando
  un test lista los `ports` publicados, entonces solo `web` publica un puerto, y
  `clinical-api` y `rag-orchestrator` no publican ninguno. `[SEG-09]` `[CLAUDE.md]`
- **AC-3 (borde · redes)** · Dado el stack levantado, cuando desde el contenedor
  `rag-orchestrator` se intenta abrir una conexión TCP a `clinical-minio:9000`, entonces
  falla por resolución o conexión, y desde `clinical-api` la misma conexión funciona.
  `[readme §2.4]` `[SEG-06]`
- **AC-4 (borde · LLM caído)** · Dado el LLM nativo detenido, cuando se consulta
  `GET /health` de `rag-orchestrator`, entonces responde `503` con
  `error = "LOCAL_LLM_UNAVAILABLE"`, y `clinical-api` sigue respondiendo `200` en su
  `/health`. `[readme §2.7]`
- **AC-5 (borde · LLM fuera de Docker)** · Dado el Compose resuelto, cuando se inspecciona
  la definición de servicios, entonces no existe ningún servicio de LLM, y
  `rag-orchestrator` lo alcanza por `LLM_BASE_URL=http://host.docker.internal:<puerto>`
  tomado de configuración. `[readme §1.4]` `[CLAUDE.md]`

## Contexto técnico
Redes según readme §2.4: `clinical-net` (web, clinical-api, postgres, clinical-minio),
`ai-net` (clinical-api, rag-orchestrator, milvus) y `corpus-db-net` (rag-orchestrator y
postgres). Healthchecks de Compose usan `/health`. AC-2 y AC-5 son tests sobre la salida
de `docker compose config` (CI, sin levantar el stack); AC-1, AC-3 y AC-4 son un smoke
test de Compose (script en `scripts/smoke/`) que corre en local y en la CI con un LLM
falso compatible con OpenAI. El presupuesto de memoria (≤ 24 GB) lo mide ADR-39.

## Non-goals
HTTPS con CA interna y acceso por VPN (S5, FEAT-T4d). Prometheus, Grafana y OTel
(ADR-44, Post-MVP).

## INVEST
**Small** ✓ un Compose, healthchecks y un smoke test.
**Testable** ✓ dos tests estáticos sobre `docker compose config` y un smoke test con tres aserciones.

---

## US-035 — Los secretos y certificados se generan con scripts y nunca se versionan

> Linear: [L1D-165](https://linear.app/l1der-lab-mjbc/issue/L1D-165)

`FEAT-PL1` · Sprint 1 · Estimación **3** · — (técnica, PRD §17) · SEG-07, SEG-08, RN-14 · 🔗 Consumida por: US-034, US-040, US-046, US-054

## Story
Como equipo de desarrollo, quiero generar con scripts las claves del JWT de servicio,
las de cifrado e índice ciego, los roles de PostgreSQL, los certificados TLS y las
credenciales de los dos MinIO, para que cada entorno tenga sus propios secretos y
ninguno llegue al repositorio público.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un clon limpio, cuando se ejecuta `scripts/setup-secrets.sh`,
  entonces genera en `infra/docker/secrets/` (ignorado por git) el par ES256 del JWT de
  servicio, la clave AES-256 de identidad, la clave HMAC del índice ciego, las
  contraseñas de los roles `clinical_api`, `research_writer` y `rag_corpus`, el
  `pg_hba.conf`, los certificados TLS de PostgreSQL y las credenciales de
  `clinical-minio` y `milvus-minio`; y `git status --porcelain` no muestra ningún
  archivo nuevo. `[readme §1.4]` `[RN-14]`
- **AC-2 (borde · reparto de secretos)** · Dado el Compose resuelto, cuando se listan los
  secretos montados por servicio, entonces la clave privada del JWT, la clave AES y la
  HMAC solo están montadas en `clinical-api`, y `rag-orchestrator` solo recibe la clave
  pública del JWT y la contraseña de `rag_corpus`. `[SEG-07]` `[ADR-6]` `[CLAUDE.md]`
- **AC-3 (borde · idempotencia)** · Dados secretos ya generados, cuando se vuelve a
  ejecutar el script sin `--rotate`, entonces no sobrescribe ninguno (mismos hashes de
  archivo) y lo informa. (asumido)
- **AC-4 (borde · TLS obligatorio)** · Dado el stack levantado, cuando `clinical-api`
  intenta conectar a PostgreSQL con `sslmode=disable`, entonces la conexión es
  rechazada por `pg_hba.conf`, y con `sslmode=require` funciona. `[SEG-08]` `[OL-01]`
- **AC-5 (borde · clave ausente)** · Dado `clinical-api` sin la clave AES o sin la HMAC
  montadas, cuando arranca, entonces no queda listo (`/health` ≠ `200`) y el log registra
  el nombre de la variable ausente, nunca un valor. `[RN-10]` (asumido)

## Contexto técnico
Scripts en `scripts/` (bash o Node, sin dependencias de nube). La regla de `pg_hba.conf`
que restringe `rag_corpus` a `corpus-db-net` se genera aquí; los `GRANT`/`REVOKE` y su
test de *permission denied* son de US-040. La gestión de respaldo de claves de identidad
queda documentada en `docs/operations/claves.md`: si se pierde la clave, se pierde la
identidad (riesgo de OL-01). AC-1 a AC-3 se verifican con un test de shell en la CI
(contenedor efímero); AC-4 y AC-5, con el smoke test de US-034.

## INVEST
**Small** ✓ un script, plantillas de `pg_hba.conf` y montajes de Compose.
**Testable** ✓ cinco aserciones sobre archivos generados, montajes y conexiones.

---

## US-036 — La CI valida build, contratos y bloquea secretos y PII en el repositorio

> Linear: [L1D-166](https://linear.app/l1der-lab-mjbc/issue/L1D-166)

`FEAT-PL1` · Sprint 1 · Estimación **5** · — (técnica, PRD §17) · RN-14 (dueña), NFR-13, SEG-12 · ↪ US-033 · 🔗 Relacionada: US-042 (estándares no permitidos), US-074 (suite en DoD)

## Story
Como equipo de desarrollo, quiero que cada PR pase por una CI que compile, ejecute los
tests, valide los contratos OpenAPI y escanee secretos y datos personales, para que un
cambio incompatible o un dato sensible nunca lleguen a `main` en un repositorio público.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un PR sin cambios de contrato ni secretos, cuando corre
  `.github/workflows/ci.yml`, entonces ejecuta build y tests de `web`, `clinical-api` y
  `rag-orchestrator`, `contracts:check` (US-033) y la regeneración de
  `packages/api-contracts`, y termina en verde. `[readme §6.0 DoD]` `[NFR-13]`
- **AC-2 (borde · cambio incompatible)** · Dado un PR que elimina el campo
  `evidenceOptions[].citedSources` del spec de `rag-orchestrator`, cuando corre la CI,
  entonces el build de `clinical-api` falla al compilar contra el cliente regenerado y
  el check de cambios incompatibles del spec también falla. `[readme §2.6]` `[NFR-13]`
- **AC-3 (borde · secreto)** · Dado un PR que agrega un archivo con una clave privada
  PEM o una cadena con forma de token, cuando corre la CI, entonces el job de escaneo de
  secretos falla y nombra el archivo. `[RN-14]` `[SEG-12]`
- **AC-4 (borde · PII en datos)** · Dado un PR que agrega en `data/` un archivo con un
  patrón de documento de identidad o de teléfono de la lista de formatos de PII
  configurada, cuando corre la CI, entonces el job de escaneo de PII falla y nombra el
  archivo y la línea, salvo que el archivo esté en la allowlist de fixtures sintéticos
  marcados `sintetico: true`. `[RN-14]` `[OL-06]`
- **AC-5 (borde · datos reales)** · Dado un PR que agrega un archivo en
  `data/evaluation/` sin la marca de dataset sintético en su cabecera o manifiesto,
  cuando corre la CI, entonces falla con el mensaje "dataset sin clase de datos
  `sintetico`". `[RN-13]` `[OL-06]` (asumido)
- **AC-6 (borde · rama protegida)** · Dado un PR con la CI en rojo, cuando se intenta
  mergear a `main`, entonces la protección de rama lo impide. (asumido)

## Contexto técnico
GitHub Actions. Escaneo de secretos con una herramienta estándar (p. ej., gitleaks) y
escaneo de PII con los mismos formatos configurables que usa el detector de Backend 1
(ADR-40), sin asumir país `[RN-22]`. El check de cambios incompatibles compara el spec
del PR con el de `main` (p. ej., oasdiff). Los AC se verifican con PRs de prueba en una
rama de la CI (fixtures de PR en `ci/tests/`), no en `main`.

## Non-goals
La ejecución de la suite de evaluación en PRs de modelo, prompt, umbral, catálogo o
corpus es de US-074. *Mutation testing* (S6).

## INVEST
**Small** ✓ un workflow con cuatro jobs reutilizando herramientas estándar.
**Testable** ✓ cada AC es un PR de prueba con resultado esperado verde o rojo.

---

## US-037 — Toda configuración calibrable vive en variables validadas al arranque y los logs salen en JSON con `traceId`

> Linear: [L1D-167](https://linear.app/l1der-lab-mjbc/issue/L1D-167)

`FEAT-PL1` · Sprint 2 · Estimación **3** · — (técnica, PRD §17) · RN-22 (dueña), RN-13 (guarda del S1), NFR-10, NFR-11 · 🔗 Regresión [RN-13] → US-143 (dueña del gate y del `preflight`, activa desde S6) · 🔗 Regresión [RN-10] → US-046 (no-fuga de identidad en logs)

## Story
Como equipo de desarrollo, quiero que todo umbral, límite o plazo "a calibrar" se lea de
configuración validada al arrancar y que los logs salgan en JSON con un `traceId`
propagado, para poder ajustar valores sin desplegar código y diagnosticar un análisis de
punta a punta sin registrar datos clínicos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `.env` con los valores de readme §1.4 (`ENABLED_CANCER_TYPES`,
  umbral de relevancia, TTL de sesión, *rate limits*, plazos de retención,
  `CLINICAL_CATALOG_VERSION`, `ANALYSIS_MEMORY_MAX`, `EVIDENCE_STALE_YEARS`,
  `AGENT_MAX_ITERATIONS`, `AGENT_MAX_SUBQUERIES`), cuando arrancan `clinical-api` y
  `rag-orchestrator`, entonces cada servicio carga su configuración a través de un único
  módulo tipado (Zod en Node, Pydantic Settings en Python) y la expone en su `/health`
  solo como nombres y versión, sin valores secretos. `[RN-22]` `[readme §1.4]`
- **AC-2 (borde · valor inválido)** · Dado `RELEVANCE_THRESHOLD=1.7` (fuera de [0,1]) o
  `SESSION_IDLE_MINUTES=abc`, cuando arranca el servicio, entonces no queda listo y el
  log nombra la variable y la regla incumplida. `[RN-22]` (asumido)
- **AC-3 (borde · datos reales antes del gate)** · Dado `REAL_ANONYMIZED_ENABLED=true` o
  `REAL_IDENTIFIED_ENABLED=true` en cualquier entorno, cuando arranca `clinical-api` sin
  el `preflight` del S5, entonces no queda listo y el log registra
  `REAL_DATA_GATE_NOT_PASSED`. `[RN-13]` `[readme §1.4 paso 9]`
- **AC-4 (borde · `traceId`)** · Dada una request a `clinical-api` con
  `X-Trace-Id: t-123` que provoca una llamada a `rag-orchestrator`, cuando se leen los
  logs de ambos servicios, entonces todas las líneas de esa request son JSON válido con
  `traceId = "t-123"`; y sin la cabecera, `clinical-api` genera uno y lo propaga.
  `[NFR-10]` `[readme §2.7]`
- **AC-5 (borde · logs sin PHI)** · Dada una request de registro de paciente con
  documento `52123456` y nombre "Lucía Fernanda Rondón Peña" (FX-T4a-a) que falla con
  `422`, cuando se leen los logs de `clinical-api`, entonces no contienen el documento,
  el nombre ni el cuerpo de la request, y el paciente aparece solo por UUID cuando
  existe. `[NFR-11]` `[CLAUDE.md]`
- **AC-6 (borde · nube deshabilitada por defecto)** · Dado un `.env` sin
  `LLM_CLOUD_ENABLED`, cuando arranca `rag-orchestrator`, entonces el valor efectivo es
  `false`. `[RN-12]` `[readme §1.4]`

## Contexto técnico
Convención de DoD (readme §6.0): un valor "propuesta, a calibrar" en el código es un
defecto de revisión. Los valores por defecto de propuesta viven en `.env.example` con un
comentario que cita su RN o TBD. Logger JSON (pino en Node, structlog o equivalente en
Python) con un serializador que descarta cuerpos de request y campos de identidad. AC-1,
AC-2, AC-3 y AC-6 son tests de arranque (Vitest y Pytest); AC-4 y AC-5 son tests de
integración (Supertest con `rag-orchestrator` simulado que captura cabeceras, y lectura
del stream de logs).

## Non-goals
`/metrics` completo y paneles (S6, ADR-44). El `preflight real-data` (US-143, S5).

## INVEST
**Small** ✓ un módulo de configuración por servicio y un logger.
**Testable** ✓ seis tests de arranque o integración con aserciones sobre el estado de salud y los logs.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-22 | PRD §7 NFR-06 y readme §2.4: *backups* con prueba de restauración "por sprint" | readme §5.0 S5 y PRD §14 S5: *backups* en el S5 | Decisión Q-06 (c): *backups* en el S5 (FEAT-T4d). Esta Feature no los incluye |
| S-01 | PRD §14 / readme §5.0: slicing original | Slicing "por hipótesis" (01-requisitos §15) | Sin cambio de sprint para esta Feature (S1 en ambos) |
| Slicing v2 | readme §5.0 S1 y OL-01/OL-02: configuración validada al arranque y logs JSON con `traceId` en el S1 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): US-037 en el S2 | En el S1 la configuración se lee sin validación de arranque; no hay datos reales ni bandera `REAL_*` que guardar (RN-13) hasta el S6 |
