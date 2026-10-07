# FEAT-T4d — Gate G-Piloto: `preflight real-data`, VPN con HTTPS, backups, mayoría de edad y decisiones legales

> Linear: [L1D-43](https://linear.app/l1der-lab-mjbc/issue/L1D-43)

**Talla:** XL (5 historias de desarrollo + ADR condicional + 5 DEC; propone división) · **Sprint:** 6 (→ G-Piloto) · `si-hay-capacidad` (US-146) · **Capacidad:** T-4 (AC-T4.1: `preflight` en verde y §11; AC-T4.5: job de mayoría de edad) · **Recorrido principal:** sí (sin el gate no hay casos reales y la hipótesis no se valida con valor clínico) · no (US-146)
**Requisitos:** RN-13 (dueña: US-143) · SEG-08 (HTTPS con CA interna), SEG-09 (VPN), SEG-11 (gate) · NFR-06 (backups cifrados con prueba de restauración) · FR-16 (job de mayoría de edad) · RN-20 (criterio de "listo" en el piloto, DEC-19) · TBD-07 (DEC-18), TBD-10 (ADR-43), TBD-16 (DEC-15) · M-05.1 (DEC-10)
**Evidencia:** [→ PRD §6 RN-13, RN-16, RN-20], [→ PRD §5 FR-16, FR-17], [→ PRD §7 NFR (Disponibilidad: *backups* cifrados con prueba de restauración)], [→ PRD §11 #6, #8, #9, #11], [→ PRD §13 Seguridad ("gate G-piloto")], [→ PRD §14 S5 y G-Piloto], [→ PRD §16 TBD-07, TBD-10, TBD-16], [→ PRD §18.4 AC-T4.1, AC-T4.4, AC-T4.5], [→ PRD §18.6 PREG-2], [→ readme §1.4 paso 9], [→ readme §2.4 Operación del piloto], [→ readme §2.5 Gate G-piloto, Aislamiento de Backend 2], [→ readme §3.1 `PATIENT.requires_ratification`], [→ readme §3.3 #17, #22], [→ readme §5.0 S5 KR3, KR4], [→ backlog/01-requisitos.md §14 Q-06 (c), §15 P-02], [→ backlog/02-adrs.md US-020, US-025, US-027, US-029, US-030, US-031, §4.6]
**Dependencias:** ↪ US-037 (guarda de arranque, S2), US-039 (seed que se niega en `piloto`), US-035 (scripts de secretos y certificados), US-034 (solo `web` publica puerto), US-040 (tests de *permission denied*), US-050 (regla de proveedores), US-083 (gate de PII), US-047 (convenio, representante, retención) · ↪ US-148 (`403` por opt-out), US-151 (auditoría completa verificada) · ⛔ DEC-12 (US-022), DEC-15 (US-025), DEC-16 (US-026), DEC-17 (US-029), DEC-18 (US-030), DEC-19 (US-031) · escenarios más probables · 🔗 Regresión [RN-12] → US-050 · 🔗 Regresión [RN-14] → US-036
**Valor:** el paso de la demo sintética al piloto con casos reales es el momento de mayor riesgo del producto. Esta Feature convierte los prerrequisitos del gate en una verificación ejecutable que impide arrancar con datos reales si falta uno, y deja listos el acceso por VPN, los backups restaurables y la marca de mayoría de edad que exige la ley.
**Workaround en el MVP (US-146):** criterio de inclusión del piloto "solo adultos", registrado en DEC-18 (US-030); el `preflight` lo verifica (US-143).
**Stories:** US-143, US-144, US-145, US-147, US-027 · ADR-43, US-020 · DEC-10, US-025 · DEC-15, US-029 · DEC-17, US-030 · DEC-18, US-031 · DEC-19 (28 puntos, S6) · US-146 (5 puntos, `si-hay-capacidad`)

> **Propuesta de división (talla XL).** Publicar sin cambiar IDs como **T4d-gate** (US-143, US-147, US-027 · ADR-43, DEC-15, DEC-17, DEC-19, DEC-10), **T4d-infra** (US-144, US-145) y **T4d-menores** (US-146, DEC-18).

## Fixtures

- **FX-T4d-a · Entorno piloto de test** (Compose en un proyecto aislado, `APP_ENV=piloto`, sin pacientes reales):
  - Configuración completa de referencia `infra/test/piloto-ok.env` con: `REAL_ANONYMIZED_ENABLED=true`, `REAL_IDENTIFIED_ENABLED=false`, `WEB_BIND_ADDRESS` en la interfaz de la VPN de test, certificado de `web` firmado por la CA interna de test, `BACKUP_TARGET` fuera del equipo (volumen de test), último `restore-test` exitoso de hace 2 días, `BACKUP_RESTORE_MAX_AGE_DAYS = 14`, `AGE_OF_MAJORITY = 18`, `ENABLED_CANCER_TYPES = mama,prostata`, proveedor LLM local, detector de PII activo, `clinical-minio` separado del almacenamiento de `rag-orchestrator`.
  - Registros de decisión de test en `docs/decisions/` para DEC-12, DEC-15, DEC-16, DEC-17, DEC-18 y DEC-19 (este último con mama y próstata "listo"), y `docs/security/revision-piloto.md` sin hallazgos críticos ni altos abiertos.
  - Variantes de fallo, una por prerrequisito: `sin-restore-reciente` (último *restore-test* de hace 20 días), `nube` (proveedor LLM de nube), `sin-https`, `sin-edad` (`AGE_OF_MAJORITY` vacía), `tipo-no-listo` (`ENABLED_CANCER_TYPES = mama,prostata,leucemia`), `hallazgo-critico` (revisión con un hallazgo crítico abierto).

---

## US-143 — `oncolens preflight real-data` verifica los prerrequisitos del gate y `clinical-api` no arranca con datos reales si alguno falla

> Linear: [L1D-217](https://linear.app/l1der-lab-mjbc/issue/L1D-217)

`FEAT-T4d` · Sprint 6 · Estimación **8** · — (técnica, PRD §17) · RN-13 (dueña), SEG-11, RN-20 (piloto) · AC-T4.1 (`preflight` en verde), AC-T4.5 (reglas de menores para identificados) · ↪ US-037, US-144, US-145, US-147, US-148 · 🔗 Absorbe el *workaround* de: US-146 (menores: criterio "solo adultos" de DEC-18), US-151 (chequeo `audit-coverage`), ambas `si-hay-capacidad` · ⛔ DEC-12, DEC-15, DEC-16, DEC-17, DEC-18, DEC-19 · escenarios más probables · 🔗 Regresión [RN-12] → US-050

## Story
Como responsable del piloto, quiero un comando que verifique todos los prerrequisitos
del gate antes de habilitar datos reales y que el servicio clínico se niegue a arrancar
si alguno falla, para que ningún dato real entre a OncoLens sin los controles que lo
protegen.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado FX-T4d-a con `piloto-ok.env`, cuando se ejecuta
  `oncolens preflight real-data`, entonces sale con código 0, el reporte marca "ok" en
  auditoría, gate de PII, regla de proveedores, `clinical-minio` separado, VPN con
  HTTPS, *backups* cifrados con restauración reciente, convenio y procedimiento de
  opt-out, política de retención, decisiones del gate registradas y revisión de
  seguridad; escribe `preflight-result.json`, y `clinical-api` con
  `REAL_ANONYMIZED_ENABLED=true` queda listo. `[RN-13]` `[SEG-11]` `[readme §2.5]` `[readme §1.4 paso 9]`
- **AC-2 (borde · prerrequisito ausente)** · Dada la variante `sin-restore-reciente`
  (y, en tests parametrizados, `nube`, `sin-https` y `hallazgo-critico`), cuando se
  ejecuta el `preflight`, entonces sale con código ≠ 0 y nombra el prerrequisito que
  falla; y `clinical-api` con la bandera en `true` no queda listo y registra
  `REAL_DATA_GATE_NOT_PASSED`. `[RN-13]` `[SEG-11]` · 🔗 Regresión: US-037 AC-3
- **AC-3 (borde · datos identificados)** · Dada la variante `sin-edad` con
  `REAL_IDENTIFIED_ENABLED=true`, cuando se ejecuta el `preflight`, entonces el bloque
  de identificados falla (identidad cifrada y reglas de menores), mientras el de
  anonimizados puede pasar. `[readme §2.5]` `[AC-T4.5]` `[SEG-11]`
- **AC-4 (borde · tipo de cáncer no listo)** · Dada la variante `tipo-no-listo`, cuando
  se ejecuta, entonces falla porque `leucemia` no está marcado "listo" en el registro de
  DEC-19. `[RN-20]` `[DEC-19]`
- **AC-5 (borde · sin chequeo de equipo tratante)** · Dado el reporte del AC-1, cuando
  se inspecciona, entonces lista "Autorización por paciente: sistema externo (P-02), no
  verificada por OncoLens" como informativa, sin afectar el resultado. `[P-02]`
- **AC-6 (borde · configuración cambiada después del preflight)** · Dado un
  `preflight-result.json` verde, cuando se cambia una variable verificada (p. ej., el
  proveedor del LLM) y se reinicia `clinical-api` con la bandera en `true`, entonces no
  queda listo porque el *hash* de configuración no coincide. (asumido)
- **AC-7 (invariante · reporte sin secretos ni datos)** · Dados los reportes de los AC
  anteriores, cuando se buscan claves, contraseñas, rutas de secretos con contenido,
  nombres o documentos, entonces no hay coincidencias: solo nombres de chequeo, estado y
  motivo. `[RN-14]` `[RN-10]` `[NFR-11]`

## Contexto técnico
Comando en `scripts/` (readme §2.3: "preflight real-data") con un chequeo por
prerrequisito de readme §2.5, cada uno con su fuente: `audit-coverage` (lista de chequeos
de este `preflight`: cada ruta de paciente con su acción auditable declarada en el
registro de US-102/US-150; *workaround* de US-151), PII
(US-083), proveedores (US-050), almacenamiento separado (configuración y credenciales de
Backend 2), VPN/HTTPS (US-144), *backups* (US-145), convenio y procedimiento (DEC-12),
retención (100 % de pacientes con `retention_*`, US-047), menores (criterio "solo adultos"
de DEC-18: ningún paciente identificado con edad menor a la de configuración; *workaround*
de US-146),
decisiones del gate (registros en `docs/decisions/` con dueño y fecha) y revisión de
seguridad (US-147). Escribe `preflight-result.json` con fecha y *hash* de la
configuración verificada; la guarda de arranque de US-037 pasa a leerlo. La
autorización por equipo tratante **no** se verifica (P-02). Si ADR-43 elige la base
separada, se suma su chequeo. Tests: Vitest de cada chequeo con FX-T4d-a y sus variantes
(AC-1…AC-6) y búsqueda de patrones de secretos y PII en la salida (AC-7); un E2E de
arranque de `clinical-api` en Compose con la bandera en `true` (AC-1, AC-2).

## Non-goals
Cargar datos reales (operación posterior al gate). Job de retención (DEC-15, Post-MVP).
Autorización por equipo tratante (FEAT-T4e, Post-MVP).

## INVEST
**Small** ✓ techo de un sprint: once chequeos simples sobre controles que ya existen; si crece, dividir en US-143a (comando y chequeos) y US-143b (guarda de arranque con *hash*).
**Testable** ✓ siete tests con variantes de configuración controladas.

---

## US-144 — `web` solo se publica en la interfaz de la VPN y con HTTPS firmado por la CA interna

> Linear: [L1D-218](https://linear.app/l1der-lab-mjbc/issue/L1D-218)

`FEAT-T4d` · Sprint 6 · Estimación **5** · — (técnica, PRD §17) · SEG-08, SEG-09, SEG-01 · AC-T4.1 (§11 #8, #9) · ↪ US-034, US-035 · 🔗 Produce para: US-143 · 🔗 Regresión [RN-14] → US-036

## Story
Como responsable del piloto, quiero que OncoLens solo sea accesible desde la VPN y por
HTTPS con certificados de una CA interna, para que los datos reales nunca viajen en
claro ni queden expuestos en la red de la institución.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado FX-T4d-a con el certificado de `web` emitido por la CA
  interna de test, cuando un cliente que confía en esa CA pide `https://<ip-vpn>/login`,
  entonces responde `200` con TLS ≥ 1.2. `[SEG-08]` `[readme §5.0 S5]`
- **AC-2 (borde · fuera de la VPN)** · Dado el mismo stack, cuando se intenta conectar
  desde una interfaz distinta de `WEB_BIND_ADDRESS` (p. ej., la LAN del equipo), entonces
  la conexión se rechaza, y `docker compose config` muestra un único puerto publicado,
  ligado a esa dirección. `[SEG-09]` · 🔗 Regresión: US-034
- **AC-3 (borde · HTTP plano)** · Dado el mismo stack, cuando se pide
  `http://<ip-vpn>/login`, entonces no se sirve contenido: la conexión se rechaza o
  redirige a HTTPS sin cuerpo. `[SEG-08]` (asumido en la redirección)
- **AC-4 (borde · cookie y cabeceras)** · Dada una sesión iniciada por HTTPS, cuando se
  inspecciona la respuesta, entonces la cookie `oncolens_session` lleva `Secure`,
  `HttpOnly` y `SameSite=Strict`, y la respuesta trae `Strict-Transport-Security`.
  `[SEG-01]` (asumido en HSTS)
- **AC-5 (invariante · clave de la CA fuera del repo)** · Dado el script que genera la
  CA y los certificados, cuando se ejecuta, entonces escribe solo en el directorio de
  secretos ignorado por git y el escaneo de CI no encuentra claves privadas.
  `[RN-14]` `[SEG-12]` · 🔗 Regresión: US-035, US-036
- **AC-6 (borde · certificado vencido)** · Dado un certificado de `web` vencido o no
  firmado por la CA interna, cuando corre el chequeo de VPN/HTTPS del `preflight`,
  entonces falla con el motivo. `[SEG-11]` (asumido)

> Pendiente de definir en refinamiento (dueño: entidad médica · afecta: AC-1, AC-2): ¿la VPN la provee la entidad médica (OncoLens solo se liga a la dirección de su interfaz) o la monta el equipo del proyecto en el equipo de referencia? Cambia qué valor de `WEB_BIND_ADDRESS` se verifica.

## Contexto técnico
`scripts/` amplía la generación de certificados del S1 (US-035) con la CA interna y el
certificado de `web`; `web` (Next.js detrás de su servidor HTTPS o de un *proxy* dentro
del mismo contenedor) se liga a `WEB_BIND_ADDRESS` en el Compose del entorno `piloto`.
Los demás servicios siguen sin publicar puertos. Tests: E2E de red con `curl` contra
Compose de test (AC-1…AC-4, AC-6) y escaneo de CI (AC-5).

## INVEST
**Small** ✓ un certificado más, un *binding* y dos cabeceras.
**Testable** ✓ seis pruebas de red y de CI.

---

## US-145 — Los backups de PostgreSQL y `clinical-minio` salen cifrados del equipo y su restauración se prueba

> Linear: [L1D-219](https://linear.app/l1der-lab-mjbc/issue/L1D-219)

`FEAT-T4d` · Sprint 6 · Estimación **5** · — (técnica, PRD §17) · NFR-06, SEG-08 · AC-T4.1 (parte: *backups*) · Q-06 (c) · ↪ US-034, US-035 · 🔗 Produce para: US-143

## Story
Como responsable del piloto, quiero backups cifrados fuera del equipo y una prueba de
restauración que demuestre que sirven, para no perder los datos clínicos del piloto ni
exponerlos en una copia.

## AC (Given/When/Then)
- **AC-1 (happy path · backup)** · Dado FX-T4d-a con datos sintéticos, cuando se ejecuta
  `scripts/backup`, entonces escribe en `BACKUP_TARGET` un archivo cifrado con la base
  completa (todos los schemas, incluido `identity`) y los objetos de `clinical-minio`,
  más un manifiesto con conteo de filas por tabla y *checksum* por objeto.
  `[NFR-06]` `[readme §2.4]` `[readme §5.0 S5]`
- **AC-2 (happy path · restauración)** · Dado el último backup, cuando se ejecuta
  `scripts/restore-test`, entonces lo restaura en un proyecto de Compose aislado,
  compara conteos y *checksums* con el manifiesto y escribe
  `restore-test-<fecha>.json` con resultado "ok". `[NFR-06]` `[Q-06]`
- **AC-3 (invariante · nunca en claro)** · Dada una ejecución sin clave de cifrado
  configurada, cuando se ejecuta `scripts/backup`, entonces sale con código ≠ 0 y no
  escribe ningún archivo; y un archivo de backup no se puede leer como SQL ni como PDF
  sin la clave. `[readme §2.4]` `[SEG-08]`
- **AC-4 (borde · backup corrupto)** · Dado un backup con un byte alterado, cuando se
  ejecuta `scripts/restore-test`, entonces el resultado es "fallido" y el chequeo de
  *backups* del `preflight` falla. (asumido)
- **AC-5 (borde · destino)** · Dado `BACKUP_TARGET` dentro del repositorio o en el mismo
  volumen que la base, cuando se ejecuta `scripts/backup`, entonces sale con código ≠ 0.
  `[readme §2.4 ("fuera del equipo")]` `[RN-14]`
- **AC-6 (borde · rotación)** · Dados backups más antiguos que
  `BACKUP_RETENTION_DAYS`, cuando se ejecuta `scripts/backup`, entonces se eliminan y
  queda registrado cuántos. `[readme §2.4 ("rotación corta, coherente con la retención")]`
  `[RN-22]`

## Contexto técnico
`pg_dump` de toda la base y espejo de los *buckets* de `clinical-minio`, cifrados con
una clave generada por `scripts/` (nunca versionada) antes de salir del equipo. El
corpus (schema `corpus` y Milvus) se reconstruye con la ingesta y no es objeto de este
backup (asumido). La prueba de restauración se repite en cada sprint siguiente (Q-06);
el `preflight` exige una de menos de `BACKUP_RESTORE_MAX_AGE_DAYS`. Tests: integración
de los scripts contra Compose de test (AC-1…AC-6).

## INVEST
**Small** ✓ dos scripts con un manifiesto.
**Testable** ✓ seis pruebas con resultado observable en archivos y códigos de salida.

---

## US-146 — El job de mayoría de edad marca "requiere ratificación" con la edad de configuración, sin bloquear al paciente

> Linear: [L1D-220](https://linear.app/l1der-lab-mjbc/issue/L1D-220)

`FEAT-T4d` · Sprint si-hay-capacidad · Estimación **5** · HU-14 (menores) · FR-16 (job de mayoría de edad), RN-16, RN-22 · AC-T4.5 (job del S5) · D-14 · ↪ US-047 (paciente menor con representante) · ⛔ DEC-18 (US-030) · escenario más probable (la edad vive en configuración; el job no se bloquea) · 🔗 Produce para: US-143 (reglas de menores) · 🔗 Regresión [RN-10] → US-046 · **Recorrido principal:** no · **Workaround en el MVP:** criterio de inclusión del piloto "solo adultos", registrado en DEC-18 (US-030); sin menores identificados no hay ratificación que marcar

## Story
Como administrador, quiero que el sistema marque a los pacientes que alcanzan la mayoría
de edad, para gestionar a tiempo la ratificación del consentimiento en el sistema externo
sin que OncoLens asuma la ley de ningún país.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados `AGE_OF_MAJORITY = 18`, el reloj fijado en `2027-01-01`
  y dos pacientes sintéticos con tarjeta de identidad y representante (`P-MENOR-A`,
  `birth_year = 2009`; `P-MENOR-B`, `birth_year = 2010`), cuando corre el job, entonces
  `P-MENOR-A.requires_ratification = true`, `P-MENOR-B` sigue en `false` y queda una
  fila de auditoría `patient.requires_ratification` con el UUID de `P-MENOR-A`.
  `[FR-16]` `[AC-T4.5]` `[readme §3.1]` `[FR-18]` (asumido en la fecha exacta, ver
  pendiente)
- **AC-2 (borde · se mantiene la presunción)** · Dado `P-MENOR-A` marcado, cuando se
  solicita un análisis de evidencia, entonces responde `200`. `[FR-16]` ("mientras tanto
  se mantiene la presunción")
- **AC-3 (borde · sin configuración)** · Dado `AGE_OF_MAJORITY` vacía, cuando arranca el
  *worker*, entonces el job no corre, registra `AGE_OF_MAJORITY_NOT_SET` y el chequeo de
  menores del `preflight` falla. `[RN-22]` `[CLAUDE.md "sin asumir país"]` `[TBD-07]`
- **AC-4 (borde · idempotente)** · Dado el job del AC-1 ya ejecutado, cuando corre otra
  vez, entonces no cambia ningún paciente ni agrega filas de auditoría. (asumido)
- **AC-5 (borde · lista para el administrador)** · Dado `P-MENOR-A` marcado, cuando el
  admin ejecuta `oncolens patients pending-ratification`, entonces la salida lista su
  UUID y la fecha de la marca, sin nombre ni documento. `[FR-16]` `[RN-10]` (asumido en
  el comando: *workaround* de UI)
- **AC-6 (invariante · sin identidad)** · Dados los *logs* y la auditoría del job,
  cuando se leen con SQL crudo y en texto, entonces no contienen nombres, documentos ni
  `birth_year`. `[RN-10]` `[NFR-11]`

> Pendiente de definir en refinamiento (dueño: área legal · afecta: AC-1): el paciente solo guarda `birth_year`; ¿la marca se pone el 1 de enero del año en que cumple la edad (puede adelantarse hasta 12 meses) o el 31 de diciembre (puede atrasarse), o hace falta guardar la fecha de nacimiento cifrada en `identity`?

## Contexto técnico
Job en `apps/clinical-api/src/workers/` (readme §2.3: "job de mayoría de edad"), diario,
con un *advisory lock* de PostgreSQL para no correr dos veces a la vez. Selecciona
pacientes con `id_type = tarjeta_identidad` (schema `identity`, sin descifrar nada) y
`requires_ratification = false`. La edad sale de `AGE_OF_MAJORITY` con el valor de DEC-18
`[RN-22]`. Tests: Vitest del job con reloj fijo y BD de test (AC-1, AC-3, AC-4, AC-6),
Supertest (AC-2) e integración de la CLI (AC-5).

## INVEST
**Small** ✓ un job con una consulta y una marca.
**Testable** ✓ seis tests con reloj fijo.

---

## US-147 — La revisión de seguridad del piloto queda registrada y ningún hallazgo crítico o alto queda abierto al gate

> Linear: [L1D-221](https://linear.app/l1der-lab-mjbc/issue/L1D-221)

`FEAT-T4d` · Sprint 6 · Estimación **3** · — (técnica, PRD §17) · AC-T4.1 (§11 1–13), AC-T4.4 · SEG-01…SEG-13 (salvo SEG-02 por equipo tratante, P-02) · ↪ US-040, US-054, US-044, US-036 · 🔗 Produce para: US-143, US-027 · ADR-43

## Story
Como responsable del piloto, quiero una revisión de seguridad registrada con la evidencia
de cada control, para entrar al piloto sabiendo qué se verificó y sin hallazgos graves
abiertos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la revisión, cuando se registra en
  `docs/security/revision-piloto.md`, entonces cada ítem de PRD §11 (1–13) tiene su
  evidencia (test o *job* de CI que lo verifica), su resultado y, si aplica, hallazgos
  con severidad, dueño y fecha. `[PRD §11]` `[AC-T4.1]`
- **AC-2 (borde · aislamiento en el entorno piloto)** · Dado el entorno piloto de
  FX-T4d-a, cuando se ejecutan los tests de *permission denied* del rol `rag_corpus`
  contra esa base (no solo en CI), entonces todos pasan y el resultado se adjunta.
  `[AC-T4.4]` `[SEG-06]` · 🔗 Regresión: US-040
- **AC-3 (borde · hallazgo crítico abierto)** · Dada una revisión con un hallazgo
  crítico o alto sin cerrar, cuando corre el `preflight`, entonces falla con el
  identificador del hallazgo. (asumido)
- **AC-4 (borde · riesgo residual de Backend 2)** · Dada la revisión, cuando se evalúa el
  riesgo residual aceptado (readme §2.5), entonces registra si recomienda abrir ADR-43
  (base separada) y con qué argumento. `[TBD-10]` `[readme §3.3 #17]`
- **AC-5 (borde · dependencias)** · Dados `npm audit` y `pip-audit` sobre los tres
  servicios, cuando se ejecutan, entonces no hay vulnerabilidades críticas sin
  mitigación registrada. (asumido)
- **AC-6 (borde · equipo tratante fuera de alcance)** · Dada la revisión, cuando se
  revisa §11 #2, entonces registra RBAC verificado y la autorización por paciente como
  responsabilidad del sistema externo (P-02). `[P-02]` `[SEG-02]`

## Contexto técnico
Revisión ligera hecha por Ingeniería (no auditoría externa). Las pruebas que ya existen
(sesión, CSRF, JWT, cifrado, no-fuga, *permission denied*, proveedores) se enlazan; no
se reescriben. El estado "sin críticos ni altos abiertos" se expone como archivo que lee
US-143. Tests: el registro es documental; AC-2 y AC-5 son ejecuciones registradas y AC-3
un test del chequeo del `preflight` con la variante `hallazgo-critico`.

## INVEST
**Small** ✓ una revisión sobre controles ya probados.
**Testable** ✓ seis verificaciones con artefacto o código de salida.

---

## US-027 · ADR-43 — Catálogo del corpus en una base de datos separada de la misma instancia

> Linear: [L1D-222](https://linear.app/l1der-lab-mjbc/issue/L1D-222)

`FEAT-T4d` · Sprint 6 (condicional al resultado de US-147) · Estimación **2** · — (ADR) · TBD-10 · readme §3.3 #17 · Dueño: Ingeniería · ⛔ Bloqueada por: US-147 (revisión de seguridad) · 🔗 Bloquea: US-143 (chequeo adicional si se elige la base separada) · **Recorrido principal:** sí, condicional · **Workaround si la revisión no lo exige:** schema `corpus` + rol `rag_corpus` + `REVOKE ALL` + `corpus-db-net` + `pg_hba` + tests de *permission denied*

## Story
Como responsable técnico, quiero decidir con el resultado de la revisión de seguridad si
el catálogo del corpus pasa a una base de datos separada en la misma instancia, para
reducir el riesgo residual aceptado de Backend 2 antes de cargar datos reales.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el informe de US-147, cuando se decida, entonces
  `docs/architecture/adr/ADR-43-corpus-base-separada.md` registra los hallazgos sobre el
  rol `rag_corpus`, la opción elegida y su coste (migración Alembic, roles, `pg_hba`,
  CI). `[TBD-10]`
- **AC-2 (borde · no reabrir)** · Dadas las alternativas ya descartadas en #17 (SQLite,
  colección de Milvus sin vectores, contenedor PostgreSQL extra), cuando se redacte,
  entonces se citan como contexto y no se evalúan de nuevo. `[readme §3.3 #17]`
- **AC-3 (invariante)** · Dada cualquier opción, cuando se especifique, entonces Backend
  2 sigue sin ruta a `clinical-minio` ni a los schemas `auth`/`identity`/`clinical`/
  `audit`/`research`, y los tests de *permission denied* siguen pasando o se amplían.
  `[CLAUDE.md]` `[SEG-06]`
- **AC-4 (memoria)** · Dada la opción "base separada en la misma instancia", cuando se
  evalúe, entonces el ADR confirma que no agrega procesos ni memoria al stack (≤ 24 GB).
  `[readme §1.4]` (asumido)

## Contexto técnico
Opciones: A · mantener el schema `corpus` (estado actual, #17; sin migración; riesgo
residual de escalamiento en la misma base) · B · base separada en la misma instancia
(aislamiento a nivel de base sin otro motor; migración del catálogo y de roles). Si se
elige B, la migración es una historia nueva del S5 que se estima entonces.

## Non-goals
No hacer la revisión de seguridad (US-147). No migrar.

## INVEST
**Small** ✓ una decisión binaria con insumo dado.
**Testable** ✓ los AC verifican el contenido del ADR.

---

## US-020 · DEC-10 — Plantillas de preguntas clínicas validadas por tipo de cáncer

> Linear: [L1D-223](https://linear.app/l1der-lab-mjbc/issue/L1D-223)

`FEAT-T4d` · Sprint 6 (como criterio del gate) · Estimación **1** · — (decisión) · M-05.1 (gobierno) · FR-28 · Dueño: oncólogo asesor · 🔗 Bloquea: FEAT-05 (cierre de CAP-05: US-171…US-173, S6 `si-hay-capacidad`) · **Recorrido principal:** no · **Workaround en el MVP:** pregunta libre en el panel; las plantillas, si se construyen, se muestran como `propuesta` sin firma

## Story
Como oncólogo asesor, quiero validar las plantillas de preguntas por tipo de cáncer,
para que las preguntas prellenadas sean clínicamente pertinentes y no prescriptivas.

> Escenario más probable (a refinar en sprint planning): como FEAT-05 (plantillas) queda para el S6 si hay capacidad, el PO retira "plantillas firmadas" de los criterios de G-Piloto y lo registra en esta historia; la validación de ≥ 5 plantillas por tipo (M-05.1) se hace sobre las plantillas `propuesta` cuando FEAT-05 se construya. Si FEAT-05 llegara antes del gate, se firman en `packages/clinical-catalogs` como propone FR-28.

## AC (Given/When/Then)
- **AC-1** · Dadas las plantillas, cuando se firmen, entonces la versión del catálogo
  lleva `validation` con alcance "plantillas", firma y fecha, y ≥ 5 por tipo.
  `[M-05.1]` (asumido)
- **AC-2** · Dadas las plantillas firmadas, cuando se revise su texto, entonces ninguna
  contiene términos de la lista prohibida de RN-23. `[RN-23]` (asumido)
- **AC-3** · Dado que FEAT-05 no existe al cierre del S5, cuando se prepare el gate,
  entonces queda registrado por el PO, con fecha, que las plantillas firmadas no son
  criterio de G-Piloto. `[PRD §14 G-Piloto]` (asumido)

## Contexto técnico
Historia de decisión (P-03 no la cambia: las plantillas sí exigen firma).

## INVEST
**Small** ✓ una revisión de textos o un registro de retirada.
**Testable** ✓ los AC verifican el registro.

---

## US-025 · DEC-15 — Validación legal de diferir el job de retención

> Linear: [L1D-224](https://linear.app/l1der-lab-mjbc/issue/L1D-224)

`FEAT-T4d` · Sprint 6 (antes de G-Piloto) · Estimación **1** · — (decisión) · TBD-16 · PREG-2 · D-15 · Dueño: área legal · 🔗 Bloquea: US-143 (decisión registrada); si se rechaza, nace una historia del job de retención en el S5 y se re-evalúa DEC-03

## Story
Como área legal, quiero pronunciarme sobre diferir el job automático de retención a
Post-MVP, para que el piloto arranque con la política registrada y un plan de borrado
aceptado.

> Escenario más probable (a refinar en sprint planning): se aprueba diferirlo, porque durante el piloto ningún dato llega a vencer (D-15, FR-17).

## AC (Given/When/Then)
- **AC-1** · Dada la consulta, cuando se registre en
  `docs/decisions/DEC-15-job-retencion.md`, entonces contiene el veredicto, condiciones y
  firma del área legal con fecha. `[TBD-16]`
- **AC-2** · Dado un rechazo, cuando se registre, entonces nombra la historia nueva en
  FEAT-T4d y avisa a DEC-03. `[PREG-2]` (asumido)

## Contexto técnico
Historia de decisión; la política y los campos `retention_*` existen desde el S1 (US-047).

## INVEST
**Small** ✓ una consulta legal y un registro.
**Testable** ✓ los AC verifican el registro.

---

## US-029 · DEC-17 — Mapeos terminológicos firmados

> Linear: [L1D-225](https://linear.app/l1der-lab-mjbc/issue/L1D-225)

`FEAT-T4d` · Sprint 6 (antes de G-Piloto) · Estimación **1** · — (decisión) · G-13, RN-27 · Dueño: oncólogo asesor · ⛔ Bloqueada por: DEC-04 (US-010), FEAT-03a/03b (mapeos y `no_mapeado` revisados) · 🔗 Bloquea: US-143 (decisión registrada) · **Workaround en S1–S4:** mapeos `propuesta`; `no_mapeado` visible (RN-27)

## Story
Como oncólogo asesor, quiero firmar los subconjuntos de mapeo CIE-10, LOINC, CUPS y ATC
por tipo de cáncer, para que los códigos que ve el piloto provengan de un catálogo
validado.

> Escenario más probable (a refinar en sprint planning): el oncólogo firma la versión del catálogo con un bloque `validation` de alcance "mapeos", porque G-Piloto exige mapeos firmados junto con los demás catálogos. P-03 no cambia esta DEC.

## AC (Given/When/Then)
- **AC-1** · Dada la versión del catálogo, cuando se firme, entonces lleva `validation`
  con alcance "mapeos", firma y fecha. `[PRD §14 G-Piloto]` (asumido)

## Contexto técnico
Historia de decisión. El `preflight` (US-143) verifica que el bloque existe en la versión
montada.

## INVEST
**Small** ✓ una sesión de revisión.
**Testable** ✓ el AC verifica el bloque `validation`.

---

## US-030 · DEC-18 — Edad de mayoría configurada

> Linear: [L1D-226](https://linear.app/l1der-lab-mjbc/issue/L1D-226)

`FEAT-T4d` · Sprint 6 (antes de G-Piloto) · Estimación **1** · — (decisión) · TBD-07 · FR-16 · Dueño: área legal + entidad médica · 🔗 Bloquea: US-143 (chequeo de menores del `preflight`), US-146 (`si-hay-capacidad`; valor de `AGE_OF_MAJORITY`) · **Workaround de gestión (no debilita el control):** el valor vive en configuración; no requiere UI; con US-146 diferida, el criterio de inclusión "solo adultos" sustituye al job

## Story
Como área legal, quiero confirmar la edad de mayoría aplicable a la entidad médica del
convenio, para que el job marque "requiere ratificación" en el momento correcto sin
asumir un país en el código.

> Escenario más probable (a refinar en sprint planning): el piloto adopta el criterio de inclusión **"solo adultos"** (slicing v2, 2026-10-07: el job de mayoría de edad, US-146, pasa a `si-hay-capacidad`), de modo que ningún paciente identificado puede alcanzar la mayoría de edad durante el piloto. El valor de `AGE_OF_MAJORITY` sigue siendo la mayoría de edad de la jurisdicción de la entidad médica del convenio; como el MVP ya usa CUPS (Colombia, readme §3.3 #23), lo más probable es 18 años (vive solo en configuración) y lo usa el chequeo de menores del `preflight` (US-143).

## AC (Given/When/Then)
- **AC-1** · Dada la jurisdicción, cuando se registre en
  `docs/decisions/DEC-18-edad-mayoria.md`, entonces contiene el valor, la norma citada y
  la firma con fecha. `[TBD-07]` (asumido)
- **AC-2** · Dado el registro, cuando se responda el pendiente de US-146, entonces
  indica cómo se aplica la edad cuando solo se conoce el año de nacimiento. (asumido)
- **AC-3 (criterio de inclusión)** · Dado el registro, cuando se revise, entonces declara
  el criterio de inclusión del piloto "solo adultos" (edad ≥ `AGE_OF_MAJORITY` al
  ingreso), con dueño y fecha, como *workaround* del job de US-146. (asumido: slicing v2)

## Contexto técnico
Historia de decisión; la mecánica del job es de US-146 (`si-hay-capacidad`) y el
chequeo "solo adultos" es del `preflight` (US-143).

## INVEST
**Small** ✓ una consulta legal.
**Testable** ✓ los AC verifican el registro.

---

## US-031 · DEC-19 — Criterio de "listo" por tipo de cáncer firmado

> Linear: [L1D-227](https://linear.app/l1der-lab-mjbc/issue/L1D-227)

`FEAT-T4d` · Sprint 6 (antes de G-Piloto) · Estimación **1** · — (decisión) · RN-20 · readme §3.3 #22 · Dueño: oncólogo asesor (catálogo) + usuario (PO) (habilitación) · ⛔ Bloqueada por: DEC-01, US-021 · DEC-11 (validados por feedback, P-03), DEC-17, US-007 · ADR-36, DEC-07 · 🔗 Bloquea: US-143 (`ENABLED_CANCER_TYPES` en el piloto) · **Workaround en S1–S5:** `ENABLED_CANCER_TYPES` habilita mama y próstata solo para la demo sintética

## Story
Como oncólogo asesor, junto con el product owner, quiero firmar que mama y próstata
cumplen el criterio de "listo", para que solo los tipos que lo cumplen se habiliten con
datos reales.

> Escenario más probable (a refinar en sprint planning): RN-20 se aplica a mama y próstata como prerrequisito de G-Piloto (no del S1), con los cuatro criterios de #22; el criterio "catálogo revisado por el oncólogo" se cumple para datos críticos (VM-5 ≥ 80 % "correcto y útil") y aplicabilidad (VM-4 ≥ 70 % con calificación ≥ 4) con el feedback agregado de US-139 (P-03; respuesta 5 del usuario, §15) y para mapeos con DEC-17. P-03 no cambia esta DEC.

## AC (Given/When/Then)
- **AC-1** · Dado cada tipo, cuando se registre en `docs/decisions/DEC-19-listo.md`,
  entonces marca los cuatro criterios de #22 (catálogo revisado, corpus con licencia,
  dataset en metas, documentos típicos cubiertos) con evidencia y firma con fecha.
  `[readme §3.3 #22]` (asumido)
- **AC-2** · Dado el registro, cuando se revise el criterio "catálogo revisado", entonces
  enlaza el reporte de US-139 con el estado "validado" de cada catálogo (aplicabilidad ←
  VM-4, datos críticos ← VM-5). `[P-03]` `[§15 resp. 5]`

## Contexto técnico
Historia de decisión. US-143 AC-4 verifica que `ENABLED_CANCER_TYPES` del piloto es un
subconjunto de los tipos marcados "listo".

## INVEST
**Small** ✓ una revisión con cuatro criterios.
**Testable** ✓ los AC verifican el registro.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | readme §2.5 Gate G-piloto: `REAL_*_ENABLED` exigen "autorización por equipo tratante"; PRD §14 G-Piloto: "T-4 completo" (incluye FR-15); PRD G-9 | Resolución del usuario P-02: autorización por paciente fuera del MVP (sistema externo) | P-02: el `preflight` no verifica pertenencia al equipo y lo declara como informativo (US-143 AC-5). Se registra para enmendar readme §2.5 y PRD §14/G-9 |
| — | PRD §14 G-Piloto: catálogos de datos críticos y aplicabilidad **firmados** | P-03: validados por el feedback agregado | P-03: DEC-19 enlaza el reporte de US-139; los mapeos (DEC-17) y las plantillas (DEC-10) siguen exigiendo firma |
| — | PRD §14 G-Piloto: plantillas firmadas | Slicing adoptado: FEAT-05 (plantillas) en el S6 si hay capacidad | El PO retira el criterio del gate y lo registra (US-020 · DEC-10 AC-3) |
| C-22 | PRD NFR-06: prueba de restauración "por sprint" | readme §5.0 S5: *backups* y prueba de restauración en el S5 | Q-06 (c): S5 (US-145) y en cada sprint siguiente |
| — | readme §5.0 S5: "`422` para cualquier registro sobre pacientes egresados" | Slicing adoptado: ciclo de vida (FEAT-T4b) en Post-MVP | El `422` queda con FEAT-T4b (US-198, Post-MVP); el gate no lo verifica porque no existe el egreso |
| — | `backlog/02-adrs.md` US-020 · DEC-10: Feature FEAT-05 | FEAT-05 en el S6 (si hay capacidad); DEC-10 es criterio del gate del S5 | DEC-10 se ubica en FEAT-T4d (S5) con el escenario de retirada del criterio |
| Slicing v2 | PRD §14 S5 y readme §5.0 S5: G-Piloto al cierre del S5; FR-16 job de mayoría de edad | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): G-Piloto en el S6 y piloto mixto en el mismo sprint; job de mayoría de edad `si-hay-capacidad` | Se siguió el slicing v2; AC-T4.5 (job) queda en US-146 `si-hay-capacidad` con el criterio "solo adultos" de DEC-18 |
