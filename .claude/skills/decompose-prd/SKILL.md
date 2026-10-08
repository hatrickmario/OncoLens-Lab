---
name: decompose-prd
description: Descompone el PRD v1.3 y el readme de OncoLens en un Product Backlog trazable — requisitos, ADRs y decisiones pendientes, Features (T-shirt), User Stories (Fibonacci, INVEST) y Acceptance Criteria (Given/When/Then) — y lo audita. Úsalo cuando se pida crear, ampliar, re-estimar o auditar el backlog, descomponer un PRD o una Feature, preparar un sprint, o convertir requisitos (FR/RN/NFR/CAP) en historias. También cuando se pregunte qué cobertura o trazabilidad tiene el backlog.
---

# Contexto del producto

OncoLens es un sistema de apoyo a la decisión clínica con IA (CDSAI) para oncólogos que tratan cáncer de **mama y próstata**. El MVP reconstruye el caso del paciente a partir de sus documentos (OCR local, timeline, reconciliación, faltantes) y entrega un **análisis de evidencia**: recupera guías y estudios de un corpus abierto, sintetiza acuerdos y discrepancias, compara criterio a criterio la población estudiada con el paciente y describe las opciones que aparecen en la evidencia, **ordenadas por aplicabilidad, con citas verificadas y sin lenguaje prescriptivo**. El objetivo del proyecto es validar que este apoyo mejora el análisis del oncólogo (métricas de valor VM-1 a VM-6).

**Encuadre obligatorio (PRD v1.3, D-01):** OncoLens **no recomienda tratamientos** ni estima probabilidad de éxito. El backlog habla de "análisis de evidencia" y de "opciones descritas en la evidencia", nunca de "recomendaciones". Cualquier texto heredado de la v1.0 (`recommendations[]`, `POST /platform/rag/query`, "consentimiento `analisis_ia` vigente") está superado.

# Descomponer el PRD en un Product Backlog

Actúas como **Senior Product Owner** especializado en productos de tecnología y software: conduces cuatro subagentes especializados y eres responsable del resultado. Tu trabajo no es escribir el backlog a mano, es **orquestar, validar los gates y llevar al usuario las decisiones que no te corresponden**.

## Fuentes de verdad (nunca inventar requisitos)

Prioridad ante conflicto: **`docs/PRD.md` v1.3 > `readme.md` > `CLAUDE.md`**. Un conflicto entre fuentes no se resuelve en silencio: se registra como vacío.

| Fuente | Qué aporta |
|---|---|
| `docs/PRD.md` §0 | Registro de cambios: D-01…D-16 (v1.1), R-01…R-31 (v1.2) y B-01…B-15 (v1.3, alineación con el backlog). Explica qué quedó superado |
| `docs/PRD.md` §2 | Objetivos `G-1`…`G-16` y métricas de valor `VM-1`…`VM-6` |
| `docs/PRD.md` §3, §18.1.2 | No-objetivos y lo que queda **fuera** del MVP (CAP-12…CAP-19) |
| `docs/PRD.md` §5 | `FR-01`…`FR-30` |
| `docs/PRD.md` §6 | `RN-01`…`RN-30` (invariantes verificables) |
| `docs/PRD.md` §7, §11, §12 | NFR, requisitos de seguridad y privacidad, requisitos de IA/ML |
| `docs/PRD.md` §14 | Roadmap Pre-S1 + Sprints 1–6 y gates G-Demo / G-Piloto / G-Éxito |
| `docs/PRD.md` §16 | `TBD-01`…`TBD-21` |
| `docs/PRD.md` §17 | Trazabilidad FR → HU → API → datos → arquitectura → Discovery → sprint |
| `docs/PRD.md` §18 | **Criterios de aceptación del MVP**: capacidades `CAP-01`…`CAP-11`, transversales `T-1`…`T-5`, `AC-P.1`; escenarios Gherkin `AC-xx.y` y medibles `M-xx.y`; supuestos `SUP-x` y `PREG-x` |
| `readme.md` §3.3, §6.1 | Decisiones de arquitectura **#1–#38** (= `ADR-1`…`ADR-38`), con alternativas descartadas; 🚧 = pendiente |
| `readme.md` §4 | Contratos OpenAPI (§4.1 `clinical-api`, §4.2 `rag-orchestrator`) |
| `readme.md` §5 | `HU-01`…`HU-26` (Gherkin completo en §5.1–5.7; resto resumido en §5.6 con el mapa HU → CAP → AC) y slicing §5.0 |
| `readme.md` §6 | Tickets `OL-01`…`OL-06` |
| `docs/AS-IS.md`, `docs/TO-BE.md` | Discovery (pains `P1`…`P12`, JTBD) y fases; solo para justificar **valor**, no para crear requisitos |
| `CLAUDE.md` | Invariantes de arquitectura y seguridad |

Un ítem del backlog **sin evidencia en estas fuentes no existe**. Si algo falta, es una pregunta abierta o un vacío que reporta el auditor, nunca un requisito inventado. El PRD y el readme no prescriben la arquitectura final: describen el stack y la arquitectura iniciales; el "cómo" se define en las specs de OpenSpec (`openspec/specs/` y `openspec/changes/`) durante el desarrollo; ver las skills `sprint-start`, `implement-story` y `sprint-close`.

## Universo de IDs (referencia única para los cuatro subagentes)

Los conteos de cobertura salen de esta tabla. Si las fuentes cambian, actualizarla aquí y en ningún otro sitio; los subagentes **verifican con `grep`** antes de confiar en ella y reportan cualquier diferencia.

| Familia | Rango | Origen | Cómo se cubre |
|---|---|---|---|
| FR | `FR-01`…`FR-30` | PRD §5 | ≥1 Feature y ≥1 Story |
| RN | `RN-01`…`RN-30` | PRD §6 | Como AC transversales en ≥1 Story (no como Story propia) |
| NFR | `NFR-01`…`NFR-14` | PRD §7, una por fila en orden | Story o AC medible |
| SEG | `SEG-01`…`SEG-13` | PRD §11, un ítem numerado cada uno | AC de seguridad en ≥1 Story |
| IA | `IA-01`…`IA-11` | PRD §12, una por fila en orden | Story o AC |
| CAP / T | `CAP-01`…`CAP-11`, `T-1`…`T-5`, `AC-P.1` | PRD §18.1.1 | ≥1 Feature |
| AC del PRD | `AC-xx.y` (Gherkin) | PRD §18.3–18.4 | Cada uno citado por ≥1 AC de Story |
| Medibles | `M-xx.y` | PRD §18.3 | Técnicos: Story de la Feature de evaluación (T-5) o AC medible. **De gobierno** (firma, validación o aprobación humana): historia `DEC-<nn>` con dueño |
| Objetivos | `G-1`…`G-16`, `VM-1`…`VM-6` | PRD §2 | Vía FR-20 / historias de medición |
| HU | `HU-01`…`HU-26` | readme §5 | ≥1 Story |
| OL | `OL-01`…`OL-06` | readme §6 | ≥1 Story (los AC del ticket se reutilizan) |
| TBD | `TBD-01`…`TBD-21` | PRD §16 | Historia de ADR, historia de decisión o exclusión justificada |
| ADR decididos | `ADR-1`…`ADR-38` | readme §3.3 #n | Se citan como contexto; no se reabren |

`NFR-xx`, `SEG-xx` e `IA-xx` son IDs **del backlog** asignados por `requirements-analyst` en F1 (el PRD no los numera); una vez publicados son inmutables.

## Workflow

Secuencial, con gate entre fases. No avanzar si el gate falla: corregir o preguntar.

```
F0 preparación → F1 requirements-analyst → F2 architecture-advisor
                                              ↓
                 F4 backlog-auditor ← F3 backlog-writer
                        ↓
                 F5 cierre y preguntas al usuario
                        ↓  ← APROBACIÓN HUMANA EXPLÍCITA
                 F6 publicación en Linear (la ejecutas tú, no un subagente)
```

Los subagentes **solo escriben Markdown**: ninguno tiene acceso al MCP de Linear. La publicación la haces tú en F6, y solo después de que el usuario apruebe.

**F0 — Preparación.** Verificar que existen `docs/PRD.md` (v1.3) y `readme.md`, y recalcular con `grep` los rangos del Universo de IDs. Comprobar que `CLAUDE.md` **en disco** está en v1.3 (`grep -q 'PRD v1.3' CLAUDE.md`); si no, detenerse. Si `CLAUDE.md` cambió durante la sesión, la copia que la sesión inyecta en el contexto de los subagentes puede estar obsoleta: correr el workflow en una **sesión nueva**. Crear `backlog/` si falta. Si ya hay backlog, leerlo: las fases siguientes **amplían, no reescriben** (los IDs ya publicados son inmutables). Si el backlog existente usa el encuadre v1.0 (recomendaciones, consentimiento por evento), avisar al usuario antes de ampliarlo.

**F1 — `requirements-analyst`** → `backlog/01-requisitos.md`.
*Gate:* inventario completo según el Universo de IDs (FR 30/30, RN 30/30, NFR 14, SEG 13, IA 11, CAP/T 17, HU 26/26, OL 6/6, TBD 21/21), cada uno con evidencia, actores y Features candidatas; mapa `AC-xx.y` → FR. Los vacíos y los conflictos entre fuentes van en su propia sección.

**F2 — `architecture-advisor`** → `backlog/02-adrs.md`.
*Gate:* cada `TBD-xx` acaba en historia de ADR (técnico), historia de decisión (clínico, legal, de producto o de capacidad) o exclusión justificada; todo 🚧 de `readme.md` §3.3/§2.7/§6.1 tiene historia de ADR. Cada historia de ADR lleva `ADR-<n>` en el título y lista qué historias bloquea.

**F3 — `backlog-writer`** → `backlog/features/FEAT-<nn>-<slug>.md`.
*Gate:* toda Feature con talla T-shirt y su `CAP`/`T`; toda Story con `Small` y `Testable` justificadas, estimación Fibonacci, **≥4 AC** (≥1 happy path, el resto de borde) y evidencia corta o `(asumido)` en cada AC. Los AC derivan de los `AC-xx.y` del PRD §18 cuando existen. Ningún AC genérico ni sin resultado observable. Toda ambigüedad del PRD lleva su nota `> Pendiente de definir en refinamiento:`. Los títulos de Pre-S1 llevan `[Pre-S1]`. Las `13` y `?`, con propuesta de división. Non-goals solo donde aporten.

**F4 — `backlog-auditor`** → `backlog/04-auditoria.md`.
*Gate:* cero hallazgos **Alta**, y solo eso. Alta = violación de una invariante del producto, o requisito (FR, RN, NFR, SEG, IA, CAP/T, `AC-xx.y`) sin ninguna cobertura; ambas comprobables con `grep`. Un escenario `AC-xx.y` del PRD §18 sin historia **bloquea** (decisión del usuario, 2026-10-05). Los hallazgos **Media** (calidad de AC, INVEST, estimación, duplicados, ambigüedad, alcance fuera del MVP sin invariante violada) **no bloquean**: se publican con label `needs-refinement`. Si hay Altas, una sola vuelta a F3 con el reporte, acotada a esas Altas; si persisten, escalar al usuario.

**F5 — Cierre.** Regenerar `backlog/03-trazabilidad.md` y presentar al usuario:
1. conteos: requisitos cubiertos por familia, Features, Stories, puntos por sprint frente a la capacidad (SUP-1, TBD-19);
2. **preguntas abiertas con dueño**, agrupadas por bloqueo (primero las que bloquean Pre-S1 y Sprint 1);
3. AC `(asumido)` que convendría confirmar;
4. las notas `Pendiente de definir en refinamiento`, **agrupadas por dueño**, con su historia y lo que bloquean;
5. los ítems que irían con `needs-refinement`.

Terminar pidiendo **aprobación explícita para publicar**. Sin un sí, no hay F6.

**F6 — Publicación en Linear.** Ver la sección siguiente. Es la única fase que escribe fuera del repo.

## Publicación en Linear

Destino fijo: proyecto **`OncoLens-1`** (`P-L1D-1`), equipo **`L1D`**, workspace `l1der-lab-mjbc`. No crear proyectos ni equipos nuevos.

| Backlog | Linear | Cómo |
|---|---|---|
| Feature | Issue **padre** | `save_issue` con `team: "L1D"`, `project: "OncoLens-1"`, label `Feature`, label de talla `size/L` y label de capacidad `CAP-08` / `T-4` |
| User Story | **Sub-issue** | `save_issue` con `parentId` del issue de la Feature y `estimate` = Fibonacci |
| Historia de ADR | Sub-issue de su Feature, o suelta si es transversal | Título **`ADR-<n> — …`**, label `ADR`; `estimate` `?` → sin `estimate` + label `estimate/?` |
| Historia de decisión | Suelta | Título **`DEC-<nn> — …`**, labels `Decisión` y `refinar-en-planning`, `estimate` = 1, dueño y escenario más probable en la descripción |
| Sprint | **Milestone** del proyecto | `save_milestone` (`Pre-S1`, `Sprint 1`…`Sprint 6`) y luego `milestone` en cada issue. Los issues de Pre-S1 conservan el prefijo `[Pre-S1]` en el título |
| Dependencia ⛔ | Relación real de bloqueo | `blockedBy` / `blocks` en `save_issue` |
| Dependencia 🔗 | `relatedTo` | — |
| Story, AC, contexto técnico, non-goals, evidencia | **Descripción** del issue, en Markdown | Los AC no se convierten en issues sueltos |
| Hallazgo Media del auditor | Label `needs-refinement` | En el issue afectado |

Orden obligatorio, porque cada paso necesita IDs del anterior: labels → milestones → issues de Feature → sub-issues de Story → historias de ADR y de decisión → relaciones de bloqueo → labels `needs-refinement`.

Reglas de publicación:
- **Idempotencia:** antes de crear, `list_issues` sobre el proyecto. Si el título ya existe, `save_issue` con su `id` (actualizar), nunca duplicar. El fichero Markdown es la fuente; Linear es el espejo.
- **Markdown y Linear se mantienen ambos.** Los ficheros de `backlog/` quedan versionados en el repo junto al PRD y son lo auditable; Linear es la herramienta de ejecución. Anotar el identificador de Linear (`L1D-NN`) junto a cada `US-xxx` en el Markdown para cerrar el círculo.
- **Texto directo, sin secuencias de escape:** saltos de línea reales en las descripciones, no `\n` literal.
- **Nada de datos reales ni secretos** en títulos, descripciones o comentarios (RN-14). Linear es un servicio externo.
- Reportar al final: issues creados, actualizados, milestones, relaciones, y los `L1D-NN` resultantes.

## Convenciones

**IDs del backlog** (inmutables, nunca se reciclan): `FEAT-01`, `US-001`, `DEC-01` (siempre con dos dígitos, para no confundirse con las decisiones `D-xx` del PRD). Los AC se numeran dentro de su historia: `AC-1`, `AC-2` (sin punto, para no confundirlos con los `AC-xx.y` del PRD).

**IDs de ADR — una sola numeración, la del readme.** Las decisiones de `readme.md` §3.3 son `ADR-1`…`ADR-38` (así las cita el PRD: ADR-31, ADR-34…). Una historia de ADR:
- reutiliza el número si la decisión ya tiene uno pendiente o parcial en §3.3 (p. ej., #7 scoring de evidencia clínica → `ADR-7`; #36 fuentes y licencias → `ADR-36`, citado así por TBD-04);
- si es nueva, toma el siguiente libre a partir de `ADR-39`, en orden de creación.

Nunca `ADR-001`: colisionaría con las decisiones ya tomadas.

**Evidencia** — obligatoria en requisitos, Features, Stories y cada AC.
- Forma larga (cabeceras de Feature e inventario): `[→ PRD §6 RN-02]` · `[→ PRD §18 AC-08.3]` · `[→ readme §3.3 #34]` · `[→ readme §6 OL-02]` · `[→ CLAUDE.md]`
- Forma corta (AC): `` `[RN-02]` `` · `` `[AC-08.3]` `` · `` `[M-07.2]` `` · `` `[ADR-34]` `` · `` `[readme §4.1]` `` · `` `[TBD-13]` ``
- `(asumido)` marca todo AC **sin evidencia clara** en las fuentes: no hay cita que lo respalde, o la cita existe pero no dice lo que el AC afirma. Ante la duda, `(asumido)`; nunca una cita forzada. Es legítimo, pero cuenta: una Story con más AC asumidos que con evidencia se estima `?` y genera pregunta abierta.

**Conflicto entre fuentes ≠ ambigüedad.** Son dos casos distintos con tratamientos distintos:
- **Conflicto** (dos fuentes lo definen, pero distinto): el AC sigue a la fuente de mayor prioridad (PRD > readme > CLAUDE.md), **sin** nota `Pendiente`. El conflicto se registra en la sección `## Conflictos de fuentes` del fichero de la Feature (cita de ambas fuentes y cuál se siguió) para que alguien corrija la fuente perdedora.
- **Ambigüedad** (ninguna fuente lo define: un criterio sin definición operativa, un umbral sin valor): la Story se redacta con el comportamiento **tal como está descrito** y justo debajo del AC o del párrafo afectado va:
  `> Pendiente de definir en refinamiento (dueño: <oncólogo | usuario | Ingeniería | área legal | entidad médica | TBD-xx> · afecta: <AC-n | M-xx.y | campo o schema | nada>): [pregunta concreta]`
  Dueño y `afecta` son obligatorios. `afecta` nombra lo que cambia según la respuesta (un AC, una métrica `M-xx.y`, un campo o schema); `nada` solo si la respuesta no altera ningún AC, métrica ni schema. Si un `TBD-xx`, `ADR-<n>` o `DEC-<nn>` ya cubre la ambigüedad, es el dueño. "¿Cómo se hace X?" no es una pregunta concreta; "¿qué cuenta como 'Parcial' en el criterio de estadio cuando la fuente reporta un rango?" sí.

**Ownership de requisitos compartidos.**
- **FR e incisos:** el dueño es la HU que asigna `docs/PRD.md` §17 (columna "Historia"). La Feature que **produce y persiste** un dato es dueña del dato; la que lo **muestra o consume** lo cita con `🔗 Consume: US-xxx` y no lo reimplementa (p. ej., FEAT de CAP-04 calcula y persiste los faltantes; la Feature de T-2/HU-20 los muestra en la Base del análisis).
- **RN:** cada RN tiene una **Story dueña** (propuesta por `requirements-analyst` en F1, asignada por `backlog-writer` en F3) que la verifica de forma exhaustiva en todos los endpoints o salidas. Las demás historias solo llevan un AC de regresión `🔗 Regresión [RN-xx] → US-dueña` cuando **introducen un endpoint o una salida nueva** que la regla cubre. Una RN que atraviesa **varias capacidades o varios tipos de salida** (p. ej., RN-26: faltantes, sin verificar, conflicto, población no comparable, desactualizado; RN-23; RN-11) tiene su historia dueña en la **Feature transversal** correspondiente (`T-1`…`T-5`), no en la primera Feature de capacidad que la exige.

**Dependencias hacia historias que aún no existen.** Una historia puede depender de otra que pertenece a una Feature todavía no escrita. Se cita con un **ID provisional** `US-<ámbito>-<nn>` (p. ej., `US-T5-01`, `US-RN15-01`) y se lista en `backlog/features/README.md`, sección `## Historias pendientes de crear`, con: ID provisional · qué debe hacer · Feature o CAP/T propuesta · sprint propuesto · historias que dependen de ella. Una dependencia provisional sin Feature **y** sin sprint propuestos es hallazgo Media. En la corrida completa, F3 **reconcilia** cada ID provisional: lo crea con su `US-xxx` definitivo o lo mapea a uno existente, y reemplaza todas sus referencias; un ID provisional que sobrevive a F3 completa es hallazgo Alta (dependencia sin cobertura).

**Bordes negativos.** Cuando una regla **no** debe aplicarse a un endpoint (p. ej., `/completeness` y `/case` no generan texto con IA, así que no responden `403` por opt-out de `analisis_ia`), el AC lo afirma en positivo: "Dado un paciente con opt-out de `analisis_ia`, cuando consulte `GET …/completeness`, entonces `200` con el checklist". Si el control aún no existe en el sprint de la historia, ese AC negativo va en la historia dueña del control, en la lista de endpoints que verifica, no en la historia del endpoint.

**Controles que llegan en un sprint posterior.** Algunos bordes obligatorios dependen de un control que todavía no existe en el sprint de la historia:

| Control | Existe desde | Fuente |
|---|---|---|
| `422` por paciente egresado (RN-17) | Post-MVP | PRD §14 (FR-14) |
| `403` por opt-out de `analisis_ia` (RN-15) | S6 | PRD §14 (FR-16, marcas por CLI, B-05), `readme.md` §6 OL-03 "No incluye" |
| `403` por equipo tratante (FR-15) | Post-MVP | PRD §0 B-03, §14; en el MVP solo RBAC |

Una historia de un sprint **anterior** al de su control no escribe ese borde como AC propio: lleva `🔗 Regresión [RN-xx] → US-dueña (activa desde S<n>)`, y la historia dueña del control incluye un AC que lo verifica en todos los endpoints afectados, incluidos los de sprints anteriores.

**Fixtures sobre datos semilla.** Un AC que usa un paciente semilla de OL-01 solo afirma lo que OL-01 define de ese paciente. Para afirmar un resultado exacto ("faltan exactamente X e Y") se declara un **fixture propio** sintético en el Contexto técnico, con la lista completa de sus datos, y el AC lo cita. Los fixtures que comparten varias historias de una Feature se declaran **una vez**, en la cabecera de la Feature (sección `## Fixtures`), con un ID (`FX-04-a`), y las historias los citan.

**Condiciones de ejecución de los tests.** El Contexto técnico de toda historia con AC de integración o E2E dice **dónde corre** el test (unitario, Supertest, Pytest con adapters falsos, Playwright contra Compose) y cómo llegan ahí sus datos: fixtures sembrados en Compose para los E2E, y la **misma versión de `packages/clinical-catalogs`** montada en ambos backends cuando la historia lee el catálogo (si difieren, el análisis responde `409`).

**Evaluación.** Una sola Feature transversal de evaluación (`T-5`, FR-20, OL-06) es dueña del arnés, los datasets sembrados y la regresión en CI, con una historia por **familia de medibles** (p. ej., "Evaluación de faltantes: dataset sembrado + M-04.1/M-04.2"). Las Features de capacidad no crean historias de evaluación: citan sus `M-xx.y` en la cabecera con `🔗 Medido en: US-xxx`.

**Títulos de Pre-S1** — toda Feature o Story (incluidas las de ADR y de decisión) cuyo sprint es Pre-S1 lleva el prefijo `[Pre-S1]` en el título, en el Markdown y en Linear: `# FEAT-00 — [Pre-S1] Decisiones previas al Sprint 1`, `## US-003 · DEC-01 — [Pre-S1] Protocolo de métricas de valor`.

**Dependencias** — explícitas y en ambos sentidos:
`⛔ Bloqueada por: ADR-39` o `⛔ TBD-12` o `⛔ DEC-03` (no se puede empezar) · `↪ Depende de: US-004` (orden preferente) · `🔗 Relacionada: US-012`

**Estimación.** Features en T-shirt (S/M/L/XL). Stories en Fibonacci (1, 2, 3, 5, 8, 13, `?`). `?` significa incertidumbre que exige un ADR, una decisión o una respuesta, no "grande". Una Story de `13` o `?` no entra a un sprint sin dividirse primero.

**Historias de decisión (`DEC-<nn>`)** — son una investigación, no un desarrollo (decisión del usuario, 2026-10-05):
- Se estiman siempre en **1 punto**. No se estiman `?` y no les aplica la regla "más AC asumidos que respaldados → `?`".
- Llevan, justo debajo de la Story, una nota con el **escenario más probable**, para que el resto del backlog pueda avanzar sobre él:
  `> Escenario más probable (a refinar en sprint planning): [qué se decidiría con mayor probabilidad y por qué, citando la fuente que lo sugiere]`
  Las historias que dependen de la DEC se redactan sobre ese escenario y lo citan; si la decisión final lo contradice, se re-estiman.
- Sus AC verifican el **registro** de la decisión (documento, versión o firma con dueño y fecha), no la mecánica técnica. Pueden ser `(asumido)` sin penalización.
- En sprint planning se refinan, ajustan y aclaran: se publican en Linear con label `refinar-en-planning`.

**Features ↔ capacidades.** Las Features se alinean con las capacidades del PRD §18 (`CAP-01`…`CAP-11`) y con una o más Features de plataforma para `T-1`…`T-5` (auth, pacientes, seguridad, evaluación). Una Feature que mezcla dos CAP lo justifica. Una CAP que atraviesa varios sprints (p. ej., CAP-08: S1 · S4) se divide en Features o Stories por sprint, no en una Feature XL.

**Idioma:** español, incluidos los valores de dominio (`sintetico`, `requiere_revision`, `cuarentena_pii`, `analisis_ia`, `no_mapeado`).

**Sprints:** usar `docs/PRD.md` §14 (coherente con `readme.md` §5.0): **Pre-S1** (decisiones) y Sprints 1–6, con el slicing v2 de la v1.3 (B-01) y los gates G-Demo (fin del S5), G-Piloto y G-Éxito (S6) (B-02). Lo `si-hay-capacidad` se prioriza en el planning de cada sprint. No reordenar el roadmap sin decirlo explícitamente al usuario. La capacidad no está estimada (TBD-19, SUP-1): reportar los puntos por sprint, no recortar alcance por cuenta propia.

## Reglas del producto que el backlog debe respetar

Estas no son sugerencias: una historia que las viole es un hallazgo de criticidad Alta.

- Ninguna historia pone datos reales en el repositorio ni en la aplicación antes del gate G-Piloto (S6) (RN-13, RN-14), ni exige datos reales para probarse antes de ese punto.
- Ninguna historia da a `rag-orchestrator` acceso a datos clínicos, a `clinical-minio` ni a schemas distintos de `corpus`.
- Ninguna historia hace viajar la identidad del paciente fuera de `clinical-api` (RN-10), ni envía contexto sin desidentificar —incluidos eventos, tratamientos previos, faltantes y análisis previos— (RN-11), ni datos reales a la nube (RN-12).
- Ninguna historia muestra una opción o afirmación generada sin cita o enlace verificado y sin chequeo de soporte (RN-01), ni la muestra antes de persistir el análisis (RN-06), ni transmite tokens del LLM sin validar.
- Ningún análisis previo de IA se usa como cita ni como soporte NLI (RN-24); las citas y los metadatos de fuente se copian del corpus (RN-04, RN-25).
- Ninguna salida ni texto de UI usa lenguaje prescriptivo (RN-23); ninguna historia ordena opciones por un puntaje clínico o por relevancia como criterio principal (RN-03, RN-28), ni estima probabilidad de éxito.
- Toda generación con IA (análisis, resumen del caso, re-ejecución, búsqueda complementaria) responde `403` con opt-out de `analisis_ia` vigente (RN-15); ningún registro sobre un paciente egresado (RN-17); los avisos clínicos no bloquean (RN-26).
- Ningún código terminológico se inventa: sin mapeo → `no_mapeado` (RN-27).
- Todo valor "a calibrar" o "propuesta" es configuración, no código (RN-22): si un AC fija un número, debe decir de dónde sale y que es configurable.

## Condiciones de finalización

El backlog está listo cuando **todas** se cumplen:

1. **Cobertura total** según el Universo de IDs: cada FR, RN, NFR, SEG, IA, CAP/T y `AC-xx.y` del PRD está vinculado a ≥1 Story (y los FR y CAP/T, además, a ≥1 Feature); cada HU y OL tiene ≥1 Story. La matriz de `backlog/03-trazabilidad.md` no tiene celdas vacías.
2. **Trazabilidad bidireccional:** de requisito a AC y de vuelta. Ningún AC huérfano.
3. **Calidad de Story:** `Small` y `Testable` justificadas (obligatorias), Fibonacci asignado, ≥4 AC con ≥1 happy path, cada AC verificable en un test funcional o de integración.
4. **Sin `?` sueltos:** toda estimación `?` tiene un `ADR-<n>`, un `DEC-<nn>` o una pregunta abierta con dueño.
5. **Decisiones:** todo `TBD-xx` del PRD §16 tiene historia de ADR, historia de decisión o justificación de exclusión.
6. **Auditoría en verde:** cero hallazgos Alta. Los Media quedan registrados en el reporte y publicados con `needs-refinement`.
7. **Preguntas con dueño:** cada pregunta abierta dice quién decide (usuario, oncólogo, área legal, entidad médica, Ingeniería, `TBD-xx`, `ADR-<n>`) y qué bloquea.
8. **Publicado y reconciliado:** cada Feature y Story existe en `OncoLens-1` con su milestone y sus relaciones, y su `L1D-NN` está anotado en el Markdown. Solo tras aprobación explícita.

Si una condición no se cumple, **decirlo explícitamente** y entregar lo demás completo. No declarar el backlog listo "con salvedades" sin enumerarlas.

## Cómo invocar los subagentes

Lanzar con la herramienta Agent, uno por fase, pasándole: la ruta de las fuentes, la ruta de su salida, el **Universo de IDs** y las **Convenciones** de esta skill (los subagentes no la ven) y el contenido relevante de la fase anterior (no la ruta: el contenido, para que no re-derive). Recordarles que lean `CLAUDE.md` del disco. Cada subagente escribe su propio fichero; tú lees el resultado, aplicas el gate y decides si avanzas.

`readme.md` (~3.100 líneas) y `docs/PRD.md` (~1.400) son grandes: indicar a cada subagente las secciones que le tocan en lugar de "léelo todo" cuando la fase no necesite el documento entero.

## Modo acotado

Si el usuario pide descomponer **una sola** Feature, capacidad o requisito, no corras el workflow completo: F3 y F4 sobre ese alcance, reutilizando el inventario existente. Si no existe inventario (`01-requisitos.md`, `02-adrs.md`), pásale a cada subagente los extractos de las fuentes que tocan ese alcance.

Al lanzar los subagentes en modo acotado, dilo explícitamente en el encargo ("**modo acotado: <alcance>**"):
- `backlog-writer`: no recibe el Universo de IDs completo, solo los IDs del alcance; las historias de otras Features van como IDs provisionales.
- `backlog-auditor`: usa la plantilla de auditoría acotada de su prompt (sin conteos globales ni recálculo de universos; el `grep` de referencias rotas solo sobre las secciones citadas por la Feature).
- La salida de F4 sigue siendo `backlog/04-auditoria.md`: es un entregable del workflow, no un informe opcional.
