# Pre-S1 · Refinamiento (fases 1–3)

> `/sprint-refine Pre-S1` · sesión principal · 2026-10-09 a 2026-10-11 · proyecto Linear **OncoLens-1**, milestone `Pre-S1` (**15 puntos**: US-033 re-estimada de 5 a 8). **Fase 3 aprobada por el usuario el 2026-10-11.** Fuente: el Markdown de `backlog/features/FEAT-00-decisiones-previas.md`; Linear es el espejo.
> Las respuestas del usuario se citan como `[Pre-S1 resp. n]` en las historias y en los documentos de diseño.

## 1. Definition of Ready

| L1D | US | Antes | Qué faltaba | Ahora |
|---|---|---|---|---|
| [L1D-54](https://linear.app/l1der-lab-mjbc/issue/L1D-54) | US-011 · DEC-05 | `refinar-en-planning` | Formato de `grade` y quién valida | ✓ Decidido (resp. 1–2). **Excepción aceptada:** la validación del oncólogo asesor queda pendiente y debe llegar antes de US-038 (S1); si la rechaza, se escala (AC-3) |
| [L1D-53](https://linear.app/l1der-lab-mjbc/issue/L1D-53) | US-010 · DEC-04 | `refinar-en-planning` | Conclusión por estándar y firma | ✓ Decidido (resp. 6, 8) con las fuentes consultadas |
| [L1D-51](https://linear.app/l1der-lab-mjbc/issue/L1D-51) | US-008 · DEC-02 | `refinar-en-planning` | Participantes, fechas, muestra mínima y metas | ✓ Decidido (resp. 4, 8) |
| [L1D-50](https://linear.app/l1der-lab-mjbc/issue/L1D-50) | US-007 · ADR-36 | Decisión pendiente | Lista de fuentes y regla de PubMed | ✓ [ADR-36](../../docs/architecture/adr/ADR-36-fuentes-y-licencias.md) aceptado (resp. 7, 8). Quedan verificaciones menores que no bloquean antes de la ingesta del S4 |
| [L1D-52](https://linear.app/l1der-lab-mjbc/issue/L1D-52) | US-009 · DEC-03 | `refinar-en-planning`; escenario desactualizado | Capacidad supuesta | ✓ Decidido (resp. 5, 9): no cabe → repliegue aprobado |
| [L1D-55](https://linear.app/l1der-lab-mjbc/issue/L1D-55) | US-033 | `needs-refinement` (auditoría M-10) | AC-6 bloqueado por ADR-39; contraste con el diseño | ✓ AC-6 parametrizado (resp. 3); AC-5 y AC-11 con DEC-05; AC-12 con la atribución de la cita (resp. 11); AC-13…AC-15 con seguimiento, antigüedad y cuentas (resp. 14–17). **Re-estimada de 5 a 8** |

**Orden de ejecución sugerido para `/sprint-start Pre-S1`:**
1. Los documentos de las DEC (`docs/decisions/DEC-02…05`), que son registros: ya está decidido qué dicen.
2. US-033, después de DEC-05.
3. ADR-36 ya está escrito: falta cerrar su historia contra los AC.

## 2. Decisiones y ADRs

| ID | Decisión | Registro |
|---|---|---|
| ADR-36 | Composición **mínima-segura**: NCI PDQ (EN + ES) más PMC OA con CC0, CC BY o CC BY-SA, evaluado por documento. PubMed sin licencia: **opción A**. CC0 se asimila a dominio público. NCCN y ESMO van a `excluded_sources`, con su licencia para una versión futura. Población curada a mano | [`docs/architecture/adr/ADR-36-fuentes-y-licencias.md`](../../docs/architecture/adr/ADR-36-fuentes-y-licencias.md) |
| DEC-02 | Metas de PRD §2.2 congeladas. `muestra_insuficiente` con < 10 análisis por tipo de cáncer. Tasa de respuesta de VM-4 ≥ 60 %. Roles anónimos. Baseline en la semana 2 del S1 | US-008, bloque `Decidido` |
| DEC-03 | 80–90 puntos por sprint → no cabe → repliegue (sección 4) | US-009, bloque `Decidido` |
| DEC-04 | Se versionan LOINC, CUPS, ATC y CIE-10 con `NOTICE` por estándar. El texto es literal y las etiquetas propias en español van aparte. La CIE-10 sale de la tabla oficial de MinSalud/SISPRO, con el riesgo registrado. El workaround de Q-07 queda sin efecto | US-010, bloque `Decidido` |
| DEC-05 | TNM en `staging_system`/`stage_value`. `grade` = `"Gleason 4+3=7 · ISUP 3"`, derivado. **Tabla hija `diagnosis_grading`** con campos estructurados y regla de coherencia | US-011, bloque `Decidido` |
| US-033 | AC-6 con la dimensión parametrizada. AC-11: `Diagnosis.gradings[]`. AC-12: `CitedSource.licenseClass/authors/sourceUrl`. La transcripción pasa de OpenAPI 3.0.3 a 3.1 | US-033, bloque `Decidido` |
| Regla | NCCN y ESMO solo pueden nombrarse como fuente no incluida | `CLAUDE.md` · Datos y repositorio público |

Investigación externa del 2026-10-09 (en subagentes):
- **Licencias de LOINC, CUPS, ATC y CIE-10.** Fuentes citadas en DEC-04.
- **Fuentes del corpus.** Hallazgo clave: PMC eliminó `oa_file_list` en agosto de 2026, así que la licencia se lee por artículo desde S3 u OAI-PMH. Además, solo ClinicalTrials.gov trae población estructurada.

## 3. Respuestas del usuario

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | DEC-05 · formato de `grade` | `"Gleason 4+3=7 · ISUP 3"`, más los campos estructurados `gleason_primary_pattern`, `gleason_secondary_pattern`, `gleason_score`, `isup_grade_group`, `specimen_type` (`biopsia \| prostatectomia`) y `grade_scope` (`nucleo_sitio \| peor \| global`) |
| 2 | DEC-05 · dónde viven los campos | Tabla hija `diagnosis_grading` (1:N con `Diagnosis`) |
| 3 | US-033 AC-6 | Se congela la estructura de Milvus con la dimensión `EMBEDDING_DIM`. El valor lo fijan ADR-39 y US-058 en el S1 |
| 4 | DEC-02 · metas y muestra mínima | Metas de PRD §2.2; `muestra_insuficiente` con < 10 análisis por tipo |
| 5 | DEC-03 · capacidad | 80–90 puntos por sprint |
| 6 | DEC-04 · política | Se versionan los cuatro estándares con aviso |
| 7 | ADR-36 · composición | Mínima-segura |
| 8 | Participantes y firma legal | Roles anónimos (nombre ↔ rol fuera del repo). Firma el PO en calidad académica y se revisa antes de G-Piloto. Tasa de respuesta de VM-4 ≥ 60 % |
| 9 | Slicing | La base del repliegue más la suite `evaluate` al S2 |
| 10 | Dirección visual | **C · Mesa de trabajo**, con más detalle y el flujo E2E completo del oncólogo: inicio, búsqueda o registro, actualización, reconstrucción del caso, análisis, decisión y evolución |
| 11 | `CitedSource` | Se añaden `licenseClass`, `authors` y `sourceUrl` |
| 12 | NCCN y ESMO | Se pueden nombrar solo como exclusión |
| 14 | Preguntas de seguimiento (revisión del canvas) | **MVP, S5**: hasta 10 por análisis, contexto anclado, guardadas en Backend 1 → US-218 y US-219. Cambia el PRD (§3/§17: Post-MVP) |
| 15 | Filtro de antigüedad de la evidencia | Contrato ahora (US-033 AC-14) y historia en el S5 → US-220 |
| 16 | Pantallas 13–15 (registro, aprobación y consola del administrador) | **S6, baja prioridad, acotado** → US-221 y US-222. Parámetros en solo lectura (RN-22); reasignar y egresar quedan Post-MVP; sin rol `investigador`; `account_status` en US-033 |
| 17 | ¿El administrador ve datos clínicos? | **No** (mínimo privilegio): US-045 AC-6 y US-222 AC-4. Cambia el PRD §11 ("admin ve todos") |
| 13 | ¿Cuándo se instala Storybook? | Se decide con un ADR en el refinamiento del S1; la propuesta es instalarlo al comienzo del S2 en una historia propia. Ver la sección 7, punto 6 |

## 4. Cambios de slicing aprobados (DEC-03, resp. 9)

| Historia | De | A | Puntos |
|---|---|---|---|
| US-213 (umbrales de calidad en la CI) | S1 | S2 | 5 |
| US-214 (verificación del proveedor contra su OpenAPI) | S1 | S2 | 3 |
| US-217 (Dependabot y auditoría de dependencias) | S1 | S2 | 2 |
| US-016 · DEC-06 | S1 | S2 | 1 |
| US-014 · ADR-41 | S1 | S2 | 3 |
| US-072 (suite `evaluate`) | S1 | S2 | 8 |
| US-074 (suite en cada PR de IA) | S1 | S2 | 3 |
| US-216 (cabeceras de seguridad de `web`) | S1 | **S6**, antes de G-Piloto | 3 |

- **Resultado:** **S1 96 · S2 96 + `?` · S6 68**. El total del MVP no cambia.
- **Registrado en:**
  - `backlog/features/README.md` (puntos por sprint y nota del repliegue);
  - `## Conflictos de fuentes` de FEAT-PL1, FEAT-T5a y FEAT-00;
  - el roadmap de `CLAUDE.md`;
  - `backlog/02-adrs.md`.
- **Lo que cambia en el S1:** sin suite automatizada ni umbrales de calidad en la CI. `ai-eval-runner` evalúa a mano la demo, y el Gate 2 del S1 funciona sin `quality-thresholds.json`.
- **No cambia:** ninguna dueña de RN-01, RN-06, RN-10…RN-14 o RN-23 sale del S1, y el camino crítico de G-Piloto se mantiene.

**Linear: actualizado el 2026-10-11, con la aprobación del usuario.**
- **Milestones:** L1D-263, 264, 267, 232, 233, 235 y 237 → Sprint 2; L1D-266 → Sprint 6. La línea de metadatos de cada descripción también se actualizó.
- **Labels:** se quitaron `refinar-en-planning` de L1D-51…54 y `needs-refinement` de L1D-55.
- **L1D-55:** la estimación pasa de 5 a 8.
- **Comentarios con la decisión:** L1D-50…55 y L1D-199 (US-045, AC-6).
- **Historias nuevas:**
  - L1D-268 (US-218) y L1D-269 (US-219), bajo FEAT-10c, Sprint 5;
  - L1D-270 (US-220), bajo FEAT-06b, Sprint 5;
  - L1D-271 (US-221) y L1D-272 (US-222), bajo FEAT-T4a, Sprint 6, prioridad baja.

### Alcance añadido tras la revisión del diseño (resp. 14–17, aprobado el 2026-10-11)

| Historia | Feature | Sprint | Puntos |
|---|---|---|---|
| US-218 · Preguntas de seguimiento (backend) | FEAT-10c | S5 | 5 |
| US-219 · Panel de seguimiento | FEAT-10c | S5 | 3 |
| US-220 · Filtro de antigüedad | FEAT-06b | S5 | 3 |
| US-221 · Registro con aprobación | FEAT-T4a | S6 | 3 |
| US-222 · Consola del administrador sin datos clínicos | FEAT-T4a | S6 | 5 |
| US-033 · re-estimada (AC-11…AC-15) | FEAT-00 | Pre-S1 | 5 → 8 |

- **Resultado final:** **Pre-S1 15 · S1 96 · S2 96 + `?` · S3 85 · S4 79 · S5 89 · S6 76**. MVP: **521** (con US-073 = 5).
- **Conflictos con el PRD** registrados para enmendarlo: C-Pre4 (conversación de varios turnos), C-Pre6 (usuarios por CLI) y C-Pre7 (`admin` ve todos).

## 5. Stack técnico (fase 2)

| Elemento | Estado |
|---|---|
| Node 26.7 · npm 12 · Python 3.13 · uv 0.12 · openspec 1.14 · gh 2.102 | ✓ ya instalados |
| Ollama 0.34.4 con `bge-m3`, `qwen3-embedding:8b` y `gemma4:12b-mlx` (candidatos de ADR-39, S1) | ✓ ya instalados |
| `oasdiff` 1.33 (brew) para sync-contracts | ✓ instalado hoy |
| `tdd-guard` 1.7 (npm -g) para el piloto del S1 | ✓ instalado hoy. Aviso de npm: los *install scripts* de `@ast-grep/lang-*` quedaron bloqueados; afecta solo a los lenguajes que no son TS ni Python, y no se espera impacto |
| MCP Playwright y Chrome DevTools (`.mcp.json`, ámbito proyecto) para `visual-check` | ✓ añadidos hoy |
| Docker Desktop 29.8 | ✓ arrancado (Compose llega en el S1, US-034) |
| Dependencias del repo de US-033 (lint de OpenAPI, validador JSON Schema) | Van como tareas del change de US-033, no aquí |

## 6. Diseño (fase 3)

- **Dirección elegida:** C · Mesa de trabajo (resp. 10). Las otras dos quedan como exploración.
- **Aprobación del usuario: 2026-10-11.** La revisión en el canvas dejó 17 hilos, todos resueltos:
  - pantallas 03b, 13, 14 y 15;
  - preguntas de seguimiento y filtro de antigüedad;
  - insignias OCR/Manual, fechas de referencia y registro de exámenes nuevos en 07;
  - nombres "Caso clínico" y "Resumen y faltantes".
- **Entregables:**
  - [`docs/ux/flujo-e2e.md`](../../docs/ux/flujo-e2e.md): 16 pantallas (12 + 03b, 13, 14 y 15), estados, textos y el dato del contrato de cada elemento;
  - [`docs/ux/sistema-de-diseno.md`](../../docs/ux/sistema-de-diseno.md): tokens, componentes sobre shadcn/ui, patrones normativos y accesibilidad;
  - [`docs/ux/prototipo/`](../../docs/ux/prototipo/README.md): prototipo navegable (https://claude.ai/artifact/PPPKXaXtq23cMfSGsg22Yp) y su fuente.
- **Revisiones:**
  - `clinical-language-auditor` en dos pasadas. La primera aprobó las tres direcciones con cambios. La segunda, sobre el flujo C, dio PASS sin bloqueantes; sus 9 observaciones están aplicadas.
  - `design:accessibility-review` (WCAG 2.1 AA): bordes de control ≥ 3:1, objetivos ≥ 44 px, foco visible y etiquetas reales.
  - Contraste con el contrato: UX-1…UX-8. UX-1, UX-2, UX-6, UX-7 y UX-8 se incorporan a US-033 antes de congelar.
- **Decisión y evolución** se diseñaron rotuladas como **Post-MVP** (FEAT-11b). El slicing no cambia.

## 7. Pendientes que no bloquean el inicio del Pre-S1

1. Validación de DEC-05 por el oncólogo asesor antes de US-038 (S1).
2. Verificaciones menores de ADR-36 (aviso de PDQ, campos de licencia en PMC, conteos) antes de la ingesta del S4.
3. Consulta informativa a la OMS por la CIE-10 (DEC-04), sin bloqueo.
4. Revisión de la firma académica de DEC-04 y ADR-36 antes de G-Piloto.
5. Actualizar readme §3.1 y §4.1 (`diagnosis_grading`, `CitedSource`) en el PR de US-033.
6. **Storybook (usuario, 2026-10-09, `[Pre-S1 resp. 13]`):** no está en el stack decidido y en el Pre-S1 no se instala, porque aún no hay `apps/web`. Se **decide con un ADR en `/sprint-refine S1`** (fases 1.2 y 2).
   - **Propuesta a evaluar:** instalarlo al comienzo del S2 como historia propia de unos 2–3 pts.
   - **Contenido de esa historia:** `@storybook/nextjs-vite`, stories del sistema de diseño con datos de `contracts/examples/`, `addon-a11y` y `storybook build` en la CI.
   - **Responsable:** `frontend-dev`, dentro de su change.
   - **Relación con lo existente:** no reemplaza a Testing Library, Playwright ni `visual-check`.
   - La historia no se crea hasta que se apruebe ese ADR.
