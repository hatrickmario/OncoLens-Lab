# S3 · Cierre (review y retrospectiva)

> Rama `sprint/S3-close`. Plan: [`S3-plan.md`](S3-plan.md) · Estado: [`S3-status.md`](S3-status.md) · Trazabilidad: [`S3-trazabilidad.md`](S3-trazabilidad.md) · Guía de la Demo 3: [`docs/demo/guia-demo-S3.md`](../../docs/demo/guia-demo-S3.md).
> Cierre ejecutado el 2026-10-28 sobre `main` e3c00924 (merge de #227).

## 1. Control: archivo y traslado

**Archivados (16)**, en este orden por dependencia de deltas: l1d-93, l1d-127, l1d-140, l1d-128, l1d-129, l1d-130, l1d-141, l1d-181, l1d-182, l1d-288, l1d-187, l1d-188, l1d-94, l1d-95a, l1d-98, l1d-287. l1d-140 y l1d-187 son de sprints anteriores y los exigían 141/182/288 y 188.

**Pasan al S4 (`movido-S4`, siguen activos, PR mergeados, tareas abiertas con ID destino):**

| Change | Abiertas | Destino |
|---|---|---|
| l1d-116 | 1 (1.10) | US-117b |
| l1d-117 | 7 | US-143 (5.2, 5.6), US-034 (5.7), US-233 (2.2, 2.3 humana, 5.3, 5.5) |
| l1d-126 | 4 (G1.6, G2.3, G2.4, G2.6) | US-232 |
| l1d-285 | 2 (5.1, 5.3) | US-232, US-222 |
| l1d-244 | 3 (2.2, 4.1, 4.2) | US-233 |
| us-117b | 2 (0.4b, G2.B2–B4/A1–A4) | US-233 |

Sin archivar y fuera del S3 (arrastres con destino): l1d-72, l1d-166, l1d-173, l1d-194, l1d-197, l1d-202, l1d-205, us-231b.

**Fusiones aprobadas (usuario, 2026-10-28):**
- l1d-128: el escenario «metadata_source pendiente entra por el camino textual y calla desconocido [US-123 AC-4] [US-122 AC-5]» reemplaza al de l1d-127 («se omite de applicability»); se conserva «fuente estructurada compatible [US-122 AC-1]».
- l1d-188: «Resumen de la Base del análisis con evidencia [US-067 AC-1]» pasa a la versión ampliada (fecha de corte y faltantes); se conservan los demás escenarios de l1d-187.
- 9 requisitos de más de 500 caracteres partidos (ejemplos y bordes a escenarios, sin perder ningún identificador): analysis-basis (2), applicability, clinical-catalogs, evidence-analysis (2), evidence-analysis-gateway, evidence-panel (2).
- Limitación de la herramienta: `openspec archive` compara escenarios por título y no permite reemplazar uno con MODIFIED/REMOVED/RENAMED; se resolvió igualando el título.

`openspec validate --specs --strict`: 24/24 · `--changes --strict`: 14/14.

## 2. Verificación global sobre `main`

| Prueba | Resultado |
|---|---|
| `/opsx:verify` de los 15 changes | 15 PASS (4 WARN solo de orden de archivado, resueltos) |
| CI de `main` (CI, E2E, Push) | en verde en 318e8df8 (#223); e3c00924 solo configuración |
| `catalog:validate` · `contracts:check` · `test:lenguaje` | OK (1.1.0) · 33 reglas sin hallazgos · 5/5 |
| Suite local `npm test` / `pytest` | No ejecutada: la raíz no tiene script `test` y no hay pytest local; la cubre la CI. 14 Pytest `models` no corren sin pesos reales |
| `run-ai-eval` (`--suite all` + aplicabilidad) | Sin regresiones (26 métricas). Bajo meta con adaptadores falsos: fidelidad 0,75, citas 0,80, cobertura de población 0,70 |
| `/security-review` del diff `abfdc0c6..main` (706 archivos) | **PASS: 0 críticos, 0 altos**; 1 medio, 3 bajos, 1 pregunta |

Hallazgos de seguridad abiertos (ninguno bloquea):
- Medio: `fast-uri` (transitiva de `ajv`) con 4 advisories moderados → `npm audit fix`/override o excepción en `security/audit-exceptions.json`.
- Bajo: el descargador no valida la IP resuelta (lista de hosts fija, sin redirecciones).
- Bajo: `PATRON_DE_CLAVE` admite `..` como `document_key`.
- Bajo: `data/evaluation/corpus-metadatos/` fuera de `.gitignore`.
- Pregunta: el listado devuelve iniciales y 2 últimos caracteres del documento (decisión L1D-202 D2 / L1D-285 D7); confirmar para el piloto (RN-10).

Reportes: `reports/eval/s3-cierre.{md,json}`, `s3-cierre-aplicabilidad.json`.

## 3. Trazabilidad

Ver [`S3-trazabilidad.md`](S3-trazabilidad.md) y `backlog/03-trazabilidad.md` (regenerado). **0 Bloqueantes.** Linear: Done confirmado en L1D-93, 94, 98, 127, 128, 129, 130, 140, 141, 181, 182, 187, 188, 287, 288; devueltas a In Review L1D-116, 117, 126, 244, 285; Features L1D-23, L1D-34 y L1D-36 a Done. Mayores a vigilar: M-1 (89 escenarios de los 6 changes activos aún no están en `openspec/specs/`), M-2 (métricas bajo meta con adaptadores falsos: riesgo para G-Demo), M-3 (US-117b y ARR-09 sin issue), M-4 (DEC-11 y DEC-01 en Backlog con milestone S3).

## 4. Review · Demo 3

Guion, pasos y preguntas para oncólogos y equipo técnico: [`docs/demo/guia-demo-S3.md`](../../docs/demo/guia-demo-S3.md). Riesgo a descartar en el ensayo: `scripts/demo/levantar.sh` no cambió en el S3; sin metadatos de población extraídos en el corpus la aplicabilidad sale «no evaluada» en vivo. Cifras a declarar (adaptadores falsos): M-08.3 = 0,70 (meta 0,90), M-08.4 = 0,95, M-08.2 = M-08.6 = 0, concordancia de estados 41/41.

## 5. Retrospectiva: lo implementado

- 20 historias del plan + seed adelantado (`l1d-95a`) mergeadas: ~25 PR (#192–#227), sin recorte de alcance; 87 pts planificados (80–90 de DEC-03).
- Decisiones del refinamiento que cambiaron: RN-27 (`no_mapeado` cuenta como presente sin verificar; «información adicional» → US-107), `pendiente` pasa de omitirse a camino textual (l1d-128), seed RE/RP/IHQ adelantado a la O3, allowlist de gitleaks acotada, sin `ignore` de etcd → Dependabot (#227), privacy-guardian a sonnet/medium.
- TDD: 106 commits `test(L1D-…)` frente a 92 `feat(L1D-…)` y 22 `fix`; 10 `Test-Removal:` (todos por cambio de AC, de spec o hallazgo Mayor del Gate 2: l1d-128 ×2, l1d-130, l1d-141, l1d-188 ×3, l1d-127, l1d-117, l1d-287).

## 6. Retrospectiva: proceso agéntico

**Situaciones críticas y causa**
- Cortes por límite de uso (429) del orquestador y los gates (×2): reanudación manual.
- CI roja tras abrir el PR (implementadores sin PostgreSQL local): gitleaks #200, baseline #213, mutación de contratos #216, carrera de tests #195, test inestable #222 (valor «4711»), ESLint #200.
- `npm ci` en un worktree con `node_modules` enlazado por symlink vació el `node_modules` del checkout principal.
- Informes del orquestador desactualizados frente a `gh`.
- 8 changes mergeados con `tasks.md` sin conciliar (chore #226); la automatización GitHub–Linear pasa a Done sin mirar tareas abiertas.
- El archive rechazó 2 changes y 4 specs por reglas de la herramienta (títulos de escenario, >500 caracteres).

**Datos de Gate 2.** Solo se registraron vueltas y reanudaciones de la O1 (93: 2+1 de CI y 3; 116: 2 y 2; 287: 2 y 3; ARR-09: 1 y 1). No hay conteo por guardián ni por principio SOLID/CUPID (P1/P2/P3) del resto: es un hueco del proceso, no un dato de calidad. El Gate 2 reducido (un pase, una vuelta, Menores a deuda) funcionó para cerrar en un día.

**Superpowers (`[S3 resp. 4]`).** Sin evidencia de uso: no hay invocaciones `superpowers:*` en las transcripciones de los subagentes ni en la sesión principal, y `S3-status.md` no las registra. No hay línea base sin el plugin, por lo que las tres métricas (vueltas de gate, reanudaciones, tareas `[x]` reabiertas) no se pueden atribuir. Indicio: «nada `[x]` sin evidencia» no se aplicó de forma sistemática (8 changes sin conciliar).

## 7. Mejoras propuestas (SIN aplicar; requieren tu aprobación)

1. **Prompt de `sprint-orchestrator`:** contrastar su informe con `gh` antes de reportar; volcar a `S3-status.md` tras cada paso; rellenar la tabla de métricas (vueltas por guardián, reanudaciones) para todas las historias; anotar el uso de cada skill de Superpowers.
2. **Definición de hecho (`docs/process/definition-of-done.md`):** `tasks.md` conciliado antes de pedir el merge (todo `[x]` con evidencia o ID destino escrito).
3. **`openspec/config.yaml` (rules):**
   ```diff
   + - En specs: el párrafo normativo de cada requisito ≤ 500 caracteres; ejemplos y bordes van en escenarios.
   + - En un MODIFIED, copia el requisito completo con los títulos de escenario exactos de main; para reemplazar un escenario conserva su título.
   ```
4. **Hook (PreToolUse Bash):** bloquear `npm ci`/`npm install` en un worktree cuyo `node_modules` sea un symlink.
5. **Implementadores:** incluir la receta de `scripts/test-integration.sh` (PostgreSQL real) en el prompt de `ai-services-dev` y `clinical-platform-dev`.
6. **Linear:** revisión manual tras cada merge del S4, o regla que devuelva a In Review las historias con tareas abiertas.
7. **Demo:** actualizar `scripts/demo/levantar.sh` (metadatos de población y pesos sparse) como tarea de US-233.
8. **Gate 2 reducido** como valor por defecto del S4; doble vuelta solo en seguridad/privacidad.
9. **Dependencias:** `npm audit fix`/override de `fast-uri` (o excepción registrada); `.gitignore` de `data/evaluation/corpus-metadatos/*.yaml`; excluir `.`/`..` en `PATRON_DE_CLAVE`.

## 8. Pendientes de decisión del humano

- Aprobar o ajustar las mejoras del §7.
- Pregunta de privacidad: exposición de iniciales y 2 últimos caracteres del documento en el listado (RN-10).
- Milestone de Linear del Sprint 3: lo cierra el humano tras mergear el PR de cierre.
- FEAT-10c (FX-10c-a): conteos sin alinear con FEAT-08b (revisar en el S4).
