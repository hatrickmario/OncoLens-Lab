# S2 · Cierre: demo, resumen y retrospectiva

> `/sprint-close S2` · 2026-10-22 · Trazabilidad: [`S2-trazabilidad.md`](S2-trazabilidad.md) · Deuda y traslados: [`S2-deuda.md`](S2-deuda.md) · Respuestas del usuario: `S2-refinamiento.md` §7 (`[S2 resp. 1…19]`).
> Todo lo marcado «propuesta» espera la aprobación del usuario; nada se aplica antes.

## 1. Control del archivo

| Grupo | Changes |
|---|---|
| **Archivados hoy (18)** | l1d-273, 114, 265, 264, 200, 199, 198, 167, 171, 170, 186, 235, 236, 237, 267, 56, 263 (con specs) y 232 (sin specs) |
| **Pasan al S3 (`movido-S3`, 18)** | S2: l1d-277, 278, 205, 187, 173, 202, 72 · S1: l1d-115, 140, 166, 180, 193, 194, 197, 238, 275, us-231a, us-231b |

Motivo común de los movidos: tareas diferidas por escrito (E2E y *visual-check* que necesitan el stack, mediciones en el MacBook de referencia, o cierre de ADR-40). Cada una tiene destino en `S2-deuda.md`.
`openspec validate --specs --strict`: 19 de 19 · `--changes --strict`: 18 de 18.

## 2. Verificación global

- **`/opsx:verify`** (procedimiento de la skill, por tres agentes de solo lectura, sobre `main`): 17 de los 18 archivados **OK** o **OK con observaciones**. Dos con problema de spec, resueltos antes de archivar con la aprobación del usuario: l1d-236 (baseline por tipo y fijación del umbral pasan a US-233) y l1d-237 (reporte como resumen del job y artefacto, sin comentario de PR). l1d-56 quedó condicionado a una decisión (DEC-21).
- **Suite completa:** la CI de `main` en verde sobre `11dc5cc8` (`build-test`, `integration`, `integration-rag`, `contracts`, `quality`, `eval-required`, `e2e` y CodeQL). No se repitió en local.
- **`run-ai-eval`:** el sprint tocó la suite y el catálogo, no modelo, prompt ni corpus. Se ejecuta solo con adaptadores falsos (humo de CI); los AC con modelos reales pasan a US-233 (S4).
- **Seguridad (revisión de todo el diff `553ab56..main` por `privacy-guardian`): PASS, sin hallazgos Críticos ni Altos.** Medio: `clinical-api` escribe los PDF con credenciales root de `clinical-minio` sin TLS ni SSE (→ S3, usuario de servicio con política mínima; TLS/SSE en S6). Bajos: `web` comparte red con postgres y MinIO (→ S6); la excepción del hook de merge y la regla AC-17 acotada a `nationalIdMasked` (vigilar que no se extienda); el 202 devuelve `originalFilename` (→ US-235).

## 3. Resumen de lo implementado

- **Puntos:** 99 planificados (85 + 14 de arrastre) · 98 con PR mergeado · **77 en Done tras la revisión profunda** y 21 en In Review por huecos acotados (L1D-187 *visual-check*, L1D-202 y L1D-72 E2E, L1D-205 ADR-40, L1D-282 AC-3 y AC-5). DEC-07 (1 pt) pasa al S4 porque depende de US-233.
- **Historias Done (20):** L1D-273, 277, 200, 199, 167, 264, 171, 198, 186, 232, 170, 267, 56, 173, 236, 237, 263, 235, 278 y 279.
- **Cambios de alcance durante el sprint** (todos con aprobación): US-078 y US-079 → S3; US-213 partida (213a en S2, 213b en S3); US-072 partida 5 + 3; DEC-06/08/09 y ARR-05 → S4; ARR-03 cerrada con lo medido con falsos y el resto en US-233 (S4); historias nuevas de deuda US-232 (S6), US-233 (S4), US-234 (S6) y US-235 (S6); DEC-21.
- **Decisiones del refinamiento que cambiaron:** el nombre del PDF queda en claro hasta G-Piloto (DEC-21); el juez de nube se descartó otra vez (ADR-41) y se acotó el juez local; la búsqueda por nombre es exacta; documento del paciente de prueba numérico, sin prefijo.
- **Nuevo en `main`:** sesión con expiración y bloqueo, usuarios por CLI con RBAC, identidad cifrada con índice ciego, configuración validada y logs JSON, catálogo montado con 409 por versión, carga de PDF (API), Base del análisis y su panel, suite `evaluate` con baseline y comparación de regresión, verificación del proveedor, calidad de capas y umbrales, auditoría de dependencias, E2E en CI.

## 4. Review · guion de demo (datos sintéticos, Compose)

El S2 no es sprint de gate; acerca G-Demo (login → listado → ficha → análisis con Base) y G-Piloto (aislamiento, identidad cifrada, calidad medida).

1. **Levantar el stack:** `scripts/demo/levantar.sh` con `LLM_PROVIDER=fake` (Compose, seed sintético).
2. **Alta de usuarios por CLI:** el administrador crea un doctor y cambia su rol; la baja revoca sus sesiones.
3. **Login** (`/login` con el sistema de diseño real): credenciales erróneas dan el mismo mensaje genérico; con 5 intentos la cuenta se bloquea; tras la inactividad configurada (`SESSION_IDLE_MINUTES=1` en el E2E) la sesión expira y redirige a `/login?motivo=expirada`; «Cerrar sesión» limpia la cookie.
4. **Listado y búsqueda** (`/pacientes`): identidades enmascaradas, etiqueta SINTÉTICO; búsqueda exacta por documento o por nombre completo (un apellido suelto no encuentra).
5. **Ficha mínima:** diagnóstico vigente con histología y gradación, biomarcadores, origen del dato, aviso de pendientes que no bloquea.
6. **Análisis con Base del análisis:** pregunta sobre el paciente de mama; el panel muestra datos usados, supuestos, fuentes consultadas y no incluidas, fecha de corte y limitaciones; con tipo no habilitado aparece «Tipo de cáncer fuera del alcance del piloto: sin análisis con IA» sin invocar a la IA.
7. **Calidad medida:** `npm run evaluate -- --suite all` con adaptadores falsos; el `eval-required` de la CI compara contra `baseline.json`.
8. **Carga de PDF (solo API):** `POST /platform/patients/{id}/documents` responde 202; el mismo archivo da 409; un archivo que no es PDF da 422. La UI llega en el S3.

## 5. Retrospectiva · mejoras críticas al proceso agéntico (propuestas, sin aplicar)

**Situaciones críticas y su causa**

| Situación | Causa | Coste |
|---|---|---|
| Orquestador cortado 3 veces (límite de sesión) | Demasiados agentes y informes largos en paralelo | Reanudaciones y trabajo repetido |
| Implementadores «detenidos por el usuario» imposibles de reanudar | Regla de permisos: solo con orden expresa | 4 preguntas al usuario (L1D-200, L1D-277, L1D-202) |
| Avisos de implementadores llegando a la sesión principal | Los implementadores escriben a «la sesión» en vez de al orquestador | ~15 reenvíos |
| Hook `pre-commit-gate` bloqueó el merge de `main` | Escaneo del diff completo del merge (falso positivo ya en `main`) | #130 |
| gitleaks marcó un valor ficticio en la historia de L1D-167 | Literal con forma de clave AWS en un commit intermedio | Reescritura acotada de rama |
| Fixture `ac5-sin-clase` roto por #136 | Acoplamiento del fixture a un directorio real del repo | #143 |
| Test inestable por la marca de hora en los logs | La aserción buscaba el valor en toda la línea | #144 |
| Test con *timeout* de 5 s en el runner de CI | Medición de ESLint lenta | #173 |
| El clasificador de permisos denegó editar una regla de seguridad al implementador | Correcto por diseño | Lo hizo la sesión principal (#161) |
| GitHub Actions degradado | Externo | `ci-ok` colgado en #124 y #177 |
| La automatización GitHub→Linear pasa a Done al mergear | Configuración de la integración | 12 historias devueltas a mano |
| Dependabot reabrió PR ya decididos | `ignore` solo cubría *majors* | #160, #171, #176 |

**Vueltas de Gate 2 por guardián** (aprox.): `privacy-guardian` falló en la 1.ª vuelta en L1D-167, L1D-278 (bloqueante) y L1D-235b (tres vueltas por RN-12), y en el re-gate de L1D-200 por el arnés de no-fuga; `contract-keeper` falló en L1D-167; `design-principles-reviewer` dio al menos un Mayor casi en cada historia. **P1 repetido:** regla duplicada con vocabulario cerrado (hosts locales, fuentes excluidas, enumerados del esquema, `SIN_RECHAZADOS`).

**TDD:** commits bloqueados por la higiene de tests: solo el falso positivo del merge. `Test-Removal` aceptados: l1d-273 (tests del empaquetador propio), l1d-198 (redirección a `?motivo=expirada`), tests de configuración más estrictos en l1d-167 y fixture ampliado en l1d-199. Tareas marcadas `[x]` que estaban diferidas (l1d-236 y l1d-237) las cazó la verificación de cierre, no el Gate 2.

**Propuestas concretas (diff sin aplicar hasta tu aprobación)**

1. **Skill Superpowers para el S3** (petición del usuario, 2026-10-22). Evaluar su inclusión en `.claude/skills/` antes de `/sprint-start S3`; definir para qué resuelve (vueltas largas de Gate 2, agentes cortados, informes duplicados), dónde se integra (agentes, `openspec/config.yaml` o skills) y cómo se mide en el S3 (vueltas de gate por historia, reanudaciones, tokens por historia). Sin instalarla hasta decidir el alcance.
2. **`sprint-orchestrator.md`:** «los avisos de implementadores van al orquestador, nunca a la sesión principal» (en el prompt de cada implementador) y «no devolver el control hasta PR con checks en 0 o situación crítica».
3. **`openspec/config.yaml` (rules de tasks):** una tarea `[x]` que contenga DIFERIDA, PARCIAL o PENDIENTE debe llevar `TRASLADADA a <ID>`; lo comprueba `check-ac-coverage` (US-213b) como alerta.
4. **`design-principles-reviewer` / `config.yaml`:** antes de añadir un literal de vocabulario cerrado (enums, listas de hosts o fuentes), buscar su fuente única; el P1 duplicado se repitió en 4 historias.
5. **Fixtures de CI herméticos:** los casos de `ci/tests/cases/` crean sus propios directorios y no dependen de rutas reales del repo.
6. **Aserciones de «no aparece en logs»:** helper común que excluye el campo de hora.
7. **Integración GitHub→Linear:** que no ponga Done al mergear; el Done lo pone `/sprint-close` (o el orquestador con criterios).
8. **Dependabot:** declarar los `ignore` de plataforma desde US-217, no después de cada PR.
9. **Paralelismo y tokens:** máximo 3 agentes, informes cortos y un solo reenvío por hallazgo; reiniciar el orquestador por oleada, no por sprint.

## 6. Decisiones (resueltas el 2026-10-22, `[S2 resp. 20]`)

1. **ADR-40 (hueco bloqueante B-1):** se mide al inicio del S3 (candidatos 1 y 2 en el MacBook) como primera tarea de `l1d-205`; US-083 espera ese ADR.
2. **DEC-07 (L1D-234):** movida al S4 en el Markdown (depende de US-233); el milestone de Linear lo cambia el humano.
3. **E2E de US-048 AC-1 y US-051 AC-1, 2 y 5:** añadidos como AC-6 de US-079 (S3), con el aviso de alcance de L1D-173 (4.3 y 4.4).
4. **Excepción de `braces` (L1D-267):** caduca el 2026-11-20; desde entonces el job `dependencies` falla en todo PR si no se resuelve.
5. **Changes del S1 con historia en Done y change abierto (9):** tras archivar lo cumplido, cerrar el resto en el S3 (US-213b y la limpieza de tareas).
