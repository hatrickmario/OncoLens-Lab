# S1 — Cierre: review (demo) y retrospectiva

> `/sprint-close S1` · 2026-10-18 · Insumos: `S1-plan.md` (decisiones 1–87), `S1-trazabilidad.md` (auditoría), `S1-pendientes-humanos.md`, verificación global sobre `main`, `/opsx:verify` y revisión de seguridad.
> Nada de la sección 3 (mejoras del proceso) está aplicado: son propuestas para que el humano las apruebe.

## 1. Control y verificación global

| Grupo | Changes |
|---|---|
| **Archivados (11)** | l1d-102, 103, 104, 105, 164, 165, 168, 169, 179, y por decisión del usuario 106 y 203 (`openspec/changes/archive/2026-10-18-*`). L1D-106 se archiva con la tarea 2.13b trasladada a US-231b 1.12 (anotado en su `tasks.md`); en L1D-203 se marcó 4.1b (103 ya archivado). |
| **Pasan al S2 (15, sin archivar)** | l1d-114, 115, 139, 140, 166, 180, 193, 194, 197, 238, 265, 274, 275, us-231a, us-231b. Motivo: tareas abiertas diferidas por escrito (D-3, US-072, mediciones humanas, `servicios_reales`) o `tasks.md` sin conciliar (194, 275). **L1D-265 no se archivó aunque se pidió:** `ruff format --check` ya está limpio (319 archivos), pero `pytest tests/evaluation` sigue con 10 fallos y 293 pasan con `requirements-dev.txt` (D-7); la auditoría de trazabilidad lo daba por verde y no lo está. |

Verificación sobre `main` (d4ad40d, árbol limpio): `pytest` de rag-orchestrator 1218 pasan (sin `tests/evaluation`, D-7) · Vitest raíz 673 · workspaces 148 + 426 + 43 · los 9 changes archivados pasan `/opsx:verify` y `openspec validate --strict` · `run-ai-eval` **no ejecutable** hasta US-072 (L1D-235) · `openspec validate --specs --strict`: 9 de 9 specs pasan. Se escribió un Purpose real en los cinco specs nuevos que quedaron en `TBD` y se acortaron dos requisitos de `api-contracts` (más de 500 caracteres, ya existentes en `main`) moviendo su cola a escenarios nuevos: «Dos changes que suben la versión del mismo spec a la vez» y «El detalle del paciente se ata al permiso con `x-view-by-permission`». Sin cambio de sentido.
**Revisión de seguridad** del diff `4444f98..main` (1085 archivos): **sin hallazgos de confianza ≥ 8**. Único punto anotado y descartado: `torch.load`/`trust_remote_code` en `app/evaluation/exportar_onnx.py` (herramienta de evaluación, no corre en producción, commit fijado).

## 2. Review (demo)

### Guion (datos sintéticos, Compose local, `LLM_PROVIDER=fake`/`MODEL_PROVIDER=fake`)
1. `scripts/setup-secrets.sh` y `docker compose -f infra/docker/docker-compose.yml up -d`; solo `web` publica puerto (127.0.0.1).
2. Login de `doc1@test.local` en `/login`: cookie opaca HttpOnly/Secure/SameSite=Strict; sin cookie, `/pacientes/<id>/analisis` redirige a `/login` (US-211 AC-1, AC-4).
3. Abrir el paciente semilla (a) `/pacientes/0fd028e2-…/analisis`: encabezado «Opciones descritas en la evidencia», aviso «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» y etiqueta «Uso académico/investigación» (US-069, US-061).
4. Lanzar el análisis: una opción con cita a un chunk recuperado, metadatos del catálogo y `relevance_score` como dato secundario (US-063, US-064, US-061).
5. Consulta sin evidencia sobre el umbral: «sin evidencia», sin invocar al LLM y con `topRelevanceScore = null` (US-055).
6. Mostrar que el navegador solo habla con `web`, que el `AIAnalysisRecord` se persistió antes de responder y que un fallo nunca muestra resultados (US-053, US-060).
7. Mostrar que `rag-orchestrator` solo ve el schema `corpus` (permission denied del rol `rag_corpus`) y que la desidentificación enmascara fechas y texto libre sin mutilar `PSA 4.0-10.0`.

**Límite honesto:** los 12 E2E de Playwright y el visual-check no se han ejecutado (D-3), de modo que el recorrido se ensaya a mano. La salida del LLM en la demo es la del modo fingido; el LLM real y las latencias dependen de L1D-274.

### AC de G-Demo/G-Piloto que el sprint acerca
Contrato `EvidenceAnalysis` y esquema congelados (PRD §18 CAP de caso → opciones), sesión y guard (T-1), no-fuga de PII (T-2), lenguaje no prescriptivo RN-23 (nivel A, lista 1.5.0), aislamiento de `rag-orchestrator` (RN-10/11/12), citas y soporte NLI (RN-01, RN-04). Aún sin evidencia ejecutada: E2E, baseline VM-1/VM-2, mediciones de p95 y OL-06.

## 3. Retrospectiva

### Resumen de lo implementado
- **PR mergeados #23–#91 (69):** 39 con historia `[L1D-nn]`/`[US-nnn]` y 25 chores (hook, `.env.example`, decisiones, cierre de tareas, timeout). 24 historias con issue + US-231a/b sin issue (límite del plan gratuito de Linear).
- **Estado tras la auditoría:** 12 historias Done confirmadas por el auditor (11 archivadas tras la decisión del usuario sobre 106 y 203, más L1D-265, que sigue sin archivar por D-7), 10 devueltas Done → In Review por falta de verificación (197, 115, 193, 238, 180, 114, 194, 275, 140, 274), 2 In Review que ya lo estaban (139, 166). Ninguna a In Progress: no se hallaron bugs.
- **Puntos:** el plan quedó en **111** (103 + el reparto de US-231 en 231a 5 y 231b 3, decisión 75). El avance por puntos no se recalculó en este cierre; lo que refleja Linear es solo Done, y la automatización GitHub–Linear lo inflaba hasta la auditoría.
- **Decisiones del refinamiento que cambiaron durante el sprint:** `RETRIEVAL_TOP_K` 40 → 30 con corte previo a 12 pares; 422 de L1D-106 y L1D-103 y 503 de L1D-180 como excepciones E-1, E-2 y E-3 de ADR-26; US-231 dividida; D-2 (Tailwind/shadcn) no se hizo antes de L1D-140; D-9 (cabeceras de seguridad web) registrada.

### Bloqueantes y Mayores de la auditoría (propuestas para el S2; sin crear issues)
- **B-1 la CI no ejecuta los tests de integración** (199 de `clinical-api` contra PostgreSQL real ni los `servicios_reales`); US-038, 039, 052, 053, 049 y 211 solo tienen evidencia local (199/199 en verde en este cierre). La tarea 2.4 de L1D-114 se perdió al diferirla. → historia S2 «La CI ejecuta la integración y `servicios_reales`».
- **B-2 siete AC sin test ejecutado** (US-058 AC-1/3/4; US-059 AC-1/3/4/5).
- Mayores: E2E y visual-check sin ejecutar (D-3; US-060 AC-3 sin test escrito), OL-06 pendiente (180, 275, 115, 193), L1D-274 sin cifras, baseline de L1D-238 sin medir, RN-06 no bloquea `DELETE`/`TRUNCATE`, US-231a/b sin issue, D-2 no hecho antes de 140, `tasks.md` de 194 y 275 sin conciliar.

### Mejoras críticas del proceso agéntico (solo propuestas; no aplicadas)
1. **El cierre de tareas se pierde al diferir.** Pasó con 114/2.4 y con los `tasks.md` sin marcar de 179, 194 y 275. Propuesta: regla en `.claude/agents/sprint-orchestrator.md` — al diferir una tarea, escribir su ID destino en el `tasks.md` y tildar las tareas cumplidas en el mismo PR de la historia; `/sprint-close` rechaza un change con 0 tareas marcadas.
2. **La CI no corre la integración** (B-1). Propuesta: job `integration` en `.github/workflows/ci.yml` (PostgreSQL + Milvus de test) dueño del admin; mientras no exista, el Gate 2 exige adjuntar la salida local de integración.
3. **Controles de CI no vistos por el implementador al integrar con `main`** (rojos de `build-test`, `stack-smoke`, `fixtures`). Propuesta: en `implement-story`, tras `git merge origin/main`, ejecutar los mismos comandos del job de CI antes del push y comprobar alertas con `refs/pull/N/head`.
4. **Test inestable** `contracts:check` (5 s por defecto, 12,6 s medidos): corregido en #88. Regla propuesta: prohibir `it` que lance procesos reales sin timeout explícito (lint de tests).
5. **Rondas de Gate 2.** Hubo historias con tres vueltas (106, 115, 102) y 3–4 guardianes en Opus cada una. Con las reglas de eficiencia acordadas (1 Gate + 1 re-gate acotado, bloqueo solo por invariante MVP, guardianes por ruta) el consumo bajó; propuesta: fijar `design-principles-reviewer` en Sonnet y dejar `privacy-guardian` en Opus (cambio de definición del agente, requiere OK).
6. **Excepciones de contrato que el clasificador de permisos trata como bypass.** E-2 y E-3 las aplicó la sesión principal con la decisión directa del humano. Propuesta: documentar en `docs/process/` el procedimiento «excepción ADR-26» (archivos, test, texto exacto) para que cualquier sesión lo ejecute sin reinterpretar.
7. **Automatización GitHub–Linear** pasa a Done al mergear aunque falten tareas. Propuesta: cambiarla en el equipo (Workflow → GitHub) para que mergear lleve a In Review.
8. **Linear sin cupo.** US-231a/b sin issue. Propuesta: elegir plan o archivar issues antiguas antes del S2; mientras tanto el Markdown manda (`Linear: pendiente`).
9. **Violaciones SOLID/CUPID repetidas** (4 Mayores de L1D-103: rol doctor comprobado dos veces, centinela `'No disponible'` en `stagingSystem`/`stageValue`, dos significados de `ids`, grafía `deidentificador`/`desidentificador`). Corregidas dos antes del merge de 104. Propuesta de regla en `openspec/config.yaml` (rules): «un centinela de texto no sustituye a `null`; los nombres de dominio usan una sola grafía». El resto es deuda registrada en los cuerpos de los PR.

### TDD
- Commits bloqueados por la higiene de tests: los ajustes del hook `pre-commit-gate` (#44, #46, #51) tuvieron falsos positivos con fixtures binarias y merges; D-6 queda como deuda (comparación a 3 vías con `merge-base`).
- `Test-Removal` aceptados en el Gate 2: AC-5 de US-211 trasladado de 197 a 103 y el test de excepciones de contrato ampliado a E-1/E-2/E-3 (cambio de la lista declarada, sin relajar aserciones).
- TDD Guard retirado en el cierre del Pre-S1; no hay piloto que evaluar.

## 4. Para el humano

- Aprobar o ajustar las propuestas del punto 3 (ninguna aplicada).
- Mergear el PR de este cierre (`sprint/S1-close`); el milestone de Linear lo cierra el humano.
- Tareas humanas: ver `S1-pendientes-humanos.md` (oncólogos L1D-238, mediciones L1D-274, protección de `main`, etc.).

## 5. Arrastre al S2 y Post-MVP fuera de Linear (2026-10-18)

- `backlog/sprints/S2-arrastre.md`: 6 tarjetas de arrastre (25 puntos) aprobadas por el usuario con prioridades; las 12 historias del S1 en In Review no pasan a Done hasta cerrar su tarjeta.
- `backlog/sprints/V2-Post-MVP.md`: 80 historias (29 Post-MVP y 51 de «si hay capacidad», 295 puntos) pasan a Markdown para liberar cupo en Linear. El humano las archiva en Linear (reversible); luego se crean las issues de `S2-arrastre.md`.

## 5. Actualización posterior al cierre (2026-10-21)

Lo ocurrido después del PR de cierre (#92); el cuerpo de arriba no se reescribe.

| Tema | Estado |
|---|---|
| ADR-39 fase B (L1D-274 / ARR-04 = L1D-280) | **Hecho y archivado.** Mediciones en #107, `LLM_MODEL` en #108, change archivado en #109. Decidido (usuario, 2026-10-20): Ollama 0.34.4 y **G `gemma4:26b-a4b-it-q4_K_M`** (margen de stack 0,71 GB, exactitud OCR 0,917 aceptada). Desviaciones: protocolo del LLM reducido (1 × 100), e2e solo B y G, A/F/I/J sin medir, equipo de 48 GB. Pendiente: tests `models` de US-231a/b en la VM de Docker. |
| E2E de Playwright (ARR-02 / L1D-278) | **Parcial.** `npm run test:e2e` (`scripts/e2e/ejecutar.sh`): 17 de 17 en Chromium contra Compose fingido (#111, #118). Cerradas por ello: L1D-139 (2.8, 3.2; archivado), L1D-140 (4.2), L1D-197 (3.3). Siguen en S2: job de CI de E2E y migración de `/login` a Tailwind + shadcn con su visual-check (140: 2.7 y 3.5; 194: 3.3; 197: 3.5). |
| Demo con LLM real | `scripts/demo/levantar.sh`, `apagar.sh`, `exportar-modelos.py` y `docs/demo/runbook-demo-S1.md` (#110, #117, #114). Sustituye el guion con LLM fingido de §2 para quien tenga el equipo de referencia. |
| Mejoras de la historia del demo | ARR-07 (L1D-283, URL de la fuente original en «Fragmento citado», #116) y ARR-08 (L1D-284, detalle expandible de la opción, #118): creadas y hechas, ambas en el milestone Sprint 2. |
| Proceso | #112: regla «controles de GitHub en 0 antes de informar», `.gitignore` de los `*-status.md` y `scripts/dev/actualizar-main.sh`. |
| Corrección | #113: el corpus semilla tiene 310 chunks, no 292. |
| Sin cerrar (deuda registrada) | L1D-265 sigue sin archivar por D-7 (`ruff format` y `tests/evaluation`: 10 fallos antiguos). OL-06 manual de L1D-180, 193 y 275 sigue diferida a L1D-279 (ARR-03). Hallazgos del montaje del demo (Compose sin migración clínica ni carga de corpus, memoria del orquestador ~10 GiB que tumba Milvus con 13 GB de Docker) anotados en ADR-39 y en el runbook. |
| Falta del PO | Cerrar las 9 Features del milestone Sprint 1 en Linear (L1D-16, 18, 23, 30, 31, 40 en In Progress; L1D-34, 39, 46 en Backlog) y el propio milestone; baseline con oncólogos reales (ARR-05/L1D-281: mover de Sprint 2, se propone Sprint 4); CIE-10 (C50.9, C61) y LOINC (DEC-04); automatización GitHub–Linear y cuota de issues; decidir si D-9 (US-216) se adelanta. |
