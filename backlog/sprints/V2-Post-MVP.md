# V2 — Post-MVP y «si hay capacidad» (fuera de Linear)

> Creado el 2026-10-18 por decisión del usuario para liberar cupo en Linear (plan gratuito). **El Markdown es la fuente**: la descripción completa de cada historia sigue en `backlog/features/FEAT-*.md`. Los IDs (`US-xxx`, `L1D-nn`) son **inmutables**: las historias se archivan en Linear, no se borran ni se renumeran.
> Para recuperarlas: Linear → issue archivada → restaurar, o crear de nuevo con el texto del FEAT y anotar el ID nuevo junto al `L1D-nn` original.
> Al refinar un sprint que incluya alguna, `/sprint-refine` la vuelve a publicar en Linear con el cupo disponible.

## Resumen

| Grupo | Historias | Puntos |
|---|---|---|
| Post-MVP | 29 | 109 |
| «Si hay capacidad» (S6) | 51 | 186 |
| **Total** | **80** | **295** |

## Post-MVP

| US | Linear | Título | Feature | Sprint | Est. |
|---|---|---|---|---|---|
| US-160 | L1D-261 | La suite verifica que la memoria de análisis nunca es soporte y nunca lleva datos personales | FEAT-T5d | Post-MVP | 3 |
| US-161 | L1D-262 | La suite mide cuántos criterios resuelve la búsqueda complementaria y recalibra el p95 con el agente | FEAT-T5d | Post-MVP | 3 |
| US-028 · ADR-44 | L1D-178 | Stack de observabilidad: métricas, paneles y *tracing* distribuido | FEAT-PL5 | Post-MVP | 3 |
| US-186 | L1D-132 | Si quedan criterios "No reportado por la fuente", el agente planifica sub-consultas dirigidas sobre el corpus dentro de los límites de configuración | FEAT-08c | Post-MVP | 5 |
| US-187 | L1D-133 | Lo que encuentra el agente pasa por la misma validación y solo regenera los bloques afectados | FEAT-08c | Post-MVP | 5 |
| US-188 | L1D-134 | El agente respeta el *deadline*, devuelve el primer resultado validado si no alcanza y queda registrado en `agent_steps` | FEAT-08c | Post-MVP | 3 |
| US-189 | L1D-157 | El análisis nuevo recibe como memoria los últimos N análisis de evidencia del paciente y la evolución posterior a cada uno | FEAT-11c | Post-MVP | 5 |
| US-190 | L1D-158 | La memoria viaja desidentificada, rotulada "análisis previo de IA" y delimitada como datos | FEAT-11c | Post-MVP | 3 |
| US-191 | L1D-159 | Un análisis previo nunca es citable ni cuenta como soporte, y una afirmación que solo él respalda se descarta | FEAT-11c | Post-MVP | 5 |
| US-192 | L1D-160 | Si un análisis usado como memoria queda desactualizado, el que lo usó también queda desactualizado (cascada) | FEAT-11c | Post-MVP | 3 |
| US-193 | L1D-153 | El oncólogo registra el tratamiento decidido con fármacos normalizados y un vínculo opcional al análisis, nunca a una opción descartada | FEAT-11b | Post-MVP | 5 |
| US-194 | L1D-154 | La decisión aparece en el timeline como evento derivado "Decisión registrada en OncoLens", distinta de los tratamientos previos | FEAT-11b | Post-MVP | 3 |
| US-195 | L1D-155 | El oncólogo registra la evolución, que entra al timeline y al contexto y marca desactualizados los análisis afectados | FEAT-11b | Post-MVP | 5 |
| US-196 | L1D-156 | Desde la vista de caso y desde un análisis registro la decisión y la evolución | FEAT-11b | Post-MVP | 3 |
| US-197 | L1D-206 | El tratante principal o un administrador egresa al paciente con un motivo, y la reactivación abre un episodio nuevo conservando la historia | FEAT-T4b | Post-MVP | 5 |
| US-198 | L1D-207 | Un paciente egresado no admite ningún registro hasta su reactivación: `422` en todos los endpoints de registro | FEAT-T4b | Post-MVP | 5 |
| US-199 | L1D-208 | La baja total borra identidad, representantes, histórico y PDFs, seudonimiza el resto y exige confirmación explícita | FEAT-T4b | Post-MVP | 5 |
| US-200 | L1D-209 | Un opt-out de investigación borra el histórico de investigación del paciente y evita el snapshot al egresar | FEAT-T4b | Post-MVP | 3 |
| US-201 | L1D-210 | El administrador registra y revoca marcas de opt-out desde la API y una pantalla de administración | FEAT-T4b | Post-MVP | 5 |
| US-202 | L1D-211 | Pantallas de egreso, reactivación y baja total con confirmación explícita | FEAT-T4b | Post-MVP | 3 |
| US-023 · DEC-13 | L1D-212 | Catálogo de motivos de egreso | FEAT-T4b | Post-MVP | 1 |
| US-203 | L1D-228 | El administrador gestiona el equipo tratante de cada paciente, con un único tratante principal | FEAT-T4e | Post-MVP | 3 |
| US-204 | L1D-229 | Todos los endpoints de paciente responden `403` a un doctor que no pertenece al equipo tratante; `admin` ve todo | FEAT-T4e | Post-MVP | 5 |
| US-205 | L1D-191 | La Base del análisis lista los análisis previos usados como contexto, con la marca "contexto, no evidencia" | FEAT-T2c | Post-MVP | 3 |
| US-206 | L1D-192 | La Base del análisis lista cada sub-consulta de la búsqueda complementaria, su objetivo y si encontró evidencia | FEAT-T2c | Post-MVP | 3 |
| US-207 | L1D-161 | Al egresar, se escribe un `EpisodeSnapshot` longitudinal con líneas, respuestas, progresiones y decisiones, sin identidad ni texto libre | FEAT-AP1 | Post-MVP | 5 |
| US-208 · DEC-20 | L1D-162 | Criterio de "listo" para construir la exploración de cohortes (CAP-12) | FEAT-AP1 | Post-MVP | 1 |
| US-209 | L1D-230 | El job diario renueva hasta el máximo de 20 años y, al vencer, aplica la baja total de forma auditada | FEAT-T4f | Post-MVP | 5 |
| US-210 | L1D-231 | El administrador recibe el aviso de los vencimientos de los próximos 90 días, sin datos personales | FEAT-T4f | Post-MVP | 3 |

## «Si hay capacidad» (S6, condicionadas)

| US | Linear | Título | Feature | Sprint | Est. |
|---|---|---|---|---|---|
| US-042 | L1D-172 | El validador mínimo impide publicar un catálogo con ítems sin destino o con estándares no permitidos | FEAT-PL3 | `si-hay-capacidad` | 3 |
| US-077 | L1D-57 | El oncólogo sube varios PDFs en una sola acción y cada uno avanza por su cuenta | FEAT-01a | `si-hay-capacidad` | 3 |
| US-080 | L1D-60 | Desde un dato extraído abro el documento de origen en la página del valor | FEAT-01a | `si-hay-capacidad` | 3 |
| US-081 | L1D-61 | Un documento en cuarentena o con identidad distinta se muestra con su motivo y no aporta datos | FEAT-01a | `si-hay-capacidad` | 3 |
| US-091 | L1D-77 | La tendencia de cada biomarcador se calcula con el umbral del catálogo y se muestra en la ficha, la vista de caso y el contexto | FEAT-02b | `si-hay-capacidad` | 3 |
| US-094 | L1D-80 | Registro a mano tratamientos previos y atributos clínicos que no están en los documentos | FEAT-02b | `si-hay-capacidad` | 5 |
| US-095 | L1D-81 | Backend 2 genera el resumen y solo devuelve afirmaciones respaldadas por los datos que referencian | FEAT-02c | `si-hay-capacidad` | 5 |
| US-096 | L1D-82 | `clinical-api` pide el resumen con referencias opacas, lo persiste antes de responder y lo enlaza a los datos | FEAT-02c | `si-hay-capacidad` | 5 |
| US-097 | L1D-83 | Veo el resumen del caso con sus enlaces, los avisos y cuántas afirmaciones se omitieron | FEAT-02c | `si-hay-capacidad` | 3 |
| US-104 | L1D-240 | Los umbrales de confianza del OCR se calibran con el set de referencia y quedan en configuración | FEAT-T5b | `si-hay-capacidad` | 3 |
| US-106 | L1D-242 | La suite mide duplicados fusionados, conflictos detectados, fusiones incorrectas y mapeo terminológico | FEAT-T5b | `si-hay-capacidad` | 5 |
| US-109 | L1D-89 | El oncólogo resuelve los valores en conflicto y mapea los términos no reconocidos | FEAT-03b | `si-hay-capacidad` | 5 |
| US-112 | L1D-109 | La recuperación combina *dense* y *sparse* y mantiene la relevancia del *reranker* | FEAT-06b | `si-hay-capacidad` | 5 |
| US-113 | L1D-110 | Una pregunta en español recupera también evidencia en inglés, y viceversa | FEAT-06b | `si-hay-capacidad` | 3 |
| US-114 | L1D-111 | Las fuentes y los filtros del panel se aplican de verdad a la búsqueda y al contexto | FEAT-06b | `si-hay-capacidad` | 5 |
| US-115 | L1D-112 | El panel ofrece los selectores de fuentes y filtros que el backend ya aplica | FEAT-06b | `si-hay-capacidad` | 3 |
| US-119 | L1D-118 | Cada ingesta publica una `CorpusRelease` con su fecha de corte y la Base del análisis la usa | FEAT-06c | `si-hay-capacidad` | 3 |
| US-129 | L1D-189 | Los supuestos del análisis salen de reglas del catálogo o, si los propone la IA, solo se aceptan si están anclados a un faltante y nada los contradice | FEAT-T2b | `si-hay-capacidad` | 5 |
| US-130 | L1D-190 | La Base del análisis declara las limitaciones estructurales y solo las redactadas por la IA que tienen soporte | FEAT-T2b | `si-hay-capacidad` | 3 |
| US-133 | L1D-245 | La recuperación híbrida no retrocede respecto del baseline del S1 | FEAT-T5b | `si-hay-capacidad` | 3 |
| US-015 · ADR-42 | L1D-146 | Streaming de eventos de progreso del análisis | FEAT-10c | `si-hay-capacidad` | 3 |
| US-141 | L1D-247 | El p95 del análisis se mide con aplicabilidad y hasta 3 opciones y la meta de G-5 se recalibra con ese dato | FEAT-T5b | `si-hay-capacidad` | 3 |
| US-146 | L1D-220 | El job de mayoría de edad marca "requiere ratificación" con la edad de configuración, sin bloquear al paciente | FEAT-T4d | `si-hay-capacidad` | 5 |
| US-151 | L1D-185 | La cobertura de auditoría se verifica de forma automática y el recorrido completo deja la traza esperada, como prerrequisito del gate | FEAT-T1b | `si-hay-capacidad` | 3 |
| US-157 | L1D-258 | La suite mide que la síntesis reporta las discrepancias sembradas y copia las etiquetas factuales del catálogo | FEAT-T5d | 6 `si-hay-capacidad` | 3 |
| US-158 | L1D-259 | La suite verifica que el 100 % de las citas muestra su fecha y el de las guías su versión | FEAT-T5d | 6 `si-hay-capacidad` | 2 |
| US-159 | L1D-260 | La suite verifica que todo análisis afectado queda desactualizado y que ninguna cita del historial deja de resolverse | FEAT-T5d | 6 `si-hay-capacidad` | 3 |
| US-162 | L1D-135 | `/rag/query` entrega en cada cita la fecha, la versión, el tipo de fuente y el idioma copiados del catálogo, y la marca de antigüedad | FEAT-09 | 6 `si-hay-capacidad` | 3 |
| US-163 | L1D-136 | El umbral de antigüedad vive en configuración, lo confirma el oncólogo y aplica igual en análisis y en el historial | FEAT-09 | 6 `si-hay-capacidad` | 3 |
| US-164 | L1D-137 | La tarjeta y las citas muestran la vigencia, y el análisis muestra "Evidencia actualizada al ‹fecha de corte›" | FEAT-09 | 6 `si-hay-capacidad` | 3 |
| US-165 | L1D-138 | En el historial la cita conserva su versión original y avisa "Existe una versión más reciente" | FEAT-09 | 6 `si-hay-capacidad` | 3 |
| US-166 | L1D-120 | Con dos o más fuentes sobre el umbral, `/rag/query` devuelve "Puntos de acuerdo" y "Discrepancias" y cada afirmación queda citada y con soporte | FEAT-07 | 6 `si-hay-capacidad` | 5 |
| US-167 | L1D-121 | Cada discrepancia explica la diferencia de contexto desde los metadatos, o dice "Causa de la discrepancia no identificada" | FEAT-07 | 6 `si-hay-capacidad` | 5 |
| US-168 | L1D-122 | Las etiquetas factuales de cada fuente se copian del catálogo y no se muestra ningún puntaje de solidez | FEAT-07 | 6 `si-hay-capacidad` | 3 |
| US-169 | L1D-123 | Con una sola fuente no hay sección de discrepancias, y una pregunta que no es de tratamiento recibe síntesis sin opciones | FEAT-07 | 6 `si-hay-capacidad` | 3 |
| US-170 | L1D-124 | El panel muestra la síntesis con sus citas, las etiquetas por fuente, el aviso de IA y lenguaje no prescriptivo | FEAT-07 | 6 `si-hay-capacidad` | 3 |
| US-171 | L1D-99 | Las plantillas viven en el catálogo versionado, cada marcador tiene campo de destino y `GET /platform/question-templates` las sirve por tipo de cáncer | FEAT-05 | 6 `si-hay-capacidad` | 3 |
| US-172 | L1D-100 | La plantilla se completa con los datos del caso, marca lo que falta y nunca inserta identidad | FEAT-05 | 6 `si-hay-capacidad` | 3 |
| US-173 | L1D-101 | El panel ofrece las plantillas, permite editarlas antes de enviar y el análisis guarda qué plantilla se usó | FEAT-05 | 6 `si-hay-capacidad` | 3 |
| US-174 | L1D-147 | El historial lista y muestra cada análisis previo desde su snapshot, con su contexto, sus modelos, sus versiones y la Base del análisis idéntica | FEAT-11a | 6 `si-hay-capacidad` | 5 |
| US-175 | L1D-148 | Un análisis cuyos datos cambiaron se marca "Desactualizado: datos del paciente" con la lista de cambios | FEAT-11a | 6 `si-hay-capacidad` | 5 |
| US-176 | L1D-149 | Un análisis muestra "Evidencia o catálogo más reciente disponible" cuando cambió la `CorpusRelease` o la versión del catálogo | FEAT-11a | 6 `si-hay-capacidad` | 3 |
| US-177 | L1D-150 | Re-ejecutar con datos actuales crea un análisis nuevo, recalcula los faltantes y deja el anterior intacto | FEAT-11a | 6 `si-hay-capacidad` | 5 |
| US-178 | L1D-151 | La comparación muestra opciones nuevas, opciones eliminadas y criterios de aplicabilidad que cambiaron | FEAT-11a | 6 `si-hay-capacidad` | 3 |
| US-179 | L1D-152 | Veo el historial con sus marcas, abro un análisis previo, lo re-ejecuto y comparo el resultado | FEAT-11a | 6 `si-hay-capacidad` | 5 |
| US-180 | L1D-69 | Al subir un PDF de alta, el sistema crea un borrador con los datos sugeridos y su confianza, sin crear ningún paciente | FEAT-01c | 6 `si-hay-capacidad` | 5 |
| US-181 | L1D-70 | El doctor confirma el borrador y solo entonces se crea el paciente, con las mismas reglas que el alta manual | FEAT-01c | 6 `si-hay-capacidad` | 3 |
| US-182 | L1D-71 | La pantalla "Nuevo paciente desde PDF" muestra lo sugerido, resalta lo de confianza media o baja y exige confirmar | FEAT-01c | 6 `si-hay-capacidad` | 3 |
| US-183 | L1D-175 | `/metrics` expone en los tres servicios la latencia, los errores y las métricas de IA por etapa, sin datos personales ni puertos nuevos | FEAT-PL5 | 6 `si-hay-capacidad` | 3 |
| US-184 | L1D-176 | El 100 % de las requests lleva un `traceId` que se correlaciona de `web` a `rag-orchestrator` | FEAT-PL5 | 6 `si-hay-capacidad` | 3 |
| US-185 | L1D-177 | StrykerJS alcanza un *mutation score* ≥ 70 % sobre auth, autorización y cifrado, y la CI lo exige | FEAT-PL5 | 6 `si-hay-capacidad` | 5 |

## Features y «si hay capacidad» sin milestone: retirar de Linear (revisión del 2026-10-23)

Al 2026-10-23 el proyecto tenía 251 issues activas (límite del plan gratuito: 250). Las 29 historias Post-MVP de arriba ya están fuera de Linear; **las 51 de «si hay capacidad» no** (49 siguen activas y sin milestone, más L1D-118 y L1D-172 con milestone). Faltaban además estas Features, que no estaban registradas aquí. La interfaz de Linear solo ofrece **Delete** (el archivado es automático y solo para issues cerradas), así que se retiran borrándolas: queda en «Recently deleted» 30 días y después es **irreversible**.

**Revisión previa al borrado (2026-10-23), sobre los 64 issues sin milestone (15 Features + 49 historias):**
- Sin comentarios, sin adjuntos, sin asignado, sin ciclo ni prioridad en ninguno. Los 8 revisados con relaciones (`blocks`/`blockedBy`/`relatedTo`) no tienen ninguna: las dependencias solo existen en el Markdown.
- Todos se crearon el 2026-10-07 y su única edición es el cambio en bloque del 2026-10-18 19:38 (etiqueta `si-hay-capacidad`, milestone retirado). Ninguna edición individual posterior: lo que hay en Linear es lo publicado desde el Markdown.
- Las 49 historias están completas en su `FEAT-*.md` (`## Story`, entre 4 y 7 AC, estimación y contexto técnico) y figuran en la tabla de arriba con US, `L1D-nn`, título, Feature, sprint y estimación. Las 15 Features conservan su cabecera con `> Linear: [L1D-nn]` en su `FEAT-*.md` y figuran en la tabla de abajo.
- Efectos del borrado: los enlaces `> Linear: [L1D-nn](https://linear.app/...)` de esos `FEAT-*.md` quedan rotos (el `L1D-nn` sigue siendo el identificador) y `backlog/03-trazabilidad.md` conserva los IDs como referencia histórica. Ningún otro archivo del repo los cita.
- Para recuperar una, dentro de los 30 días: Linear → archivo del equipo → *Recently deleted* → restaurar. Pasado ese plazo: crearla de nuevo con el texto del `FEAT-*.md` y anotar el ID nuevo junto al `L1D-nn` original, que no se reutiliza.

| Linear | Feature | Hijas activas en Linear | Estado |
|---|---|---|---|
| L1D-8 | FEAT-01c — Registro de paciente asistido por OCR | L1D-69, 70, 71 | retirar con sus hijas |
| L1D-11 | FEAT-02c — Resumen del caso verificable | L1D-81, 82, 83 | retirar con sus hijas |
| L1D-15 | FEAT-05 — Plantillas de preguntas clínicas | L1D-99, 100, 101 | retirar con sus hijas |
| L1D-19 | FEAT-07 — Síntesis de evidencia | L1D-120…124 | retirar con sus hijas |
| L1D-22 | FEAT-09 — Vigencia visible de la evidencia | L1D-135…138 | retirar con sus hijas |
| L1D-26 | FEAT-11a — Historial, re-ejecución y comparación | L1D-147…152 | retirar con sus hijas |
| L1D-33 | FEAT-PL5 — Hardening mínimo y observabilidad | L1D-175, 176, 177 | retirar con sus hijas |
| L1D-21 | FEAT-08c — Agente acotado | ninguna (ya archivadas) | cascarón vacío: retirar |
| L1D-27 | FEAT-11b — Decisión de tratamiento y evolución | ninguna | cascarón vacío: retirar |
| L1D-28 | FEAT-11c — Memoria de análisis previos | ninguna | cascarón vacío: retirar |
| L1D-29 | FEAT-AP1 — Preparación Post-MVP | ninguna | cascarón vacío: retirar |
| L1D-38 | FEAT-T2c — Base del análisis: memoria y agente | ninguna | cascarón vacío: retirar |
| L1D-41 | FEAT-T4b — Ciclo de vida del paciente y opt-out | ninguna | cascarón vacío: retirar |
| L1D-44 | FEAT-T4e — Equipo tratante | ninguna | cascarón vacío: retirar |
| L1D-45 | FEAT-T4f — Job de retención | ninguna | cascarón vacío: retirar |

Pre-S1 (cerrado el 2026-10-13, todo en Done): **L1D-5** (FEAT-00) y sus hijas **L1D-50…55**. No se usan para ejecutar nada; su contenido está en `FEAT-00-decisiones-previas.md`, `docs/decisions/` y `openspec/specs/`. **Decisión pendiente, no incluida en este borrado:** son historia cerrada y citada desde 4 a 16 archivos del repo.

Total a retirar ahora: 15 Features + 49 historias = **64 issues** (251 → 187). Con los 7 del Pre-S1 serían 71 (251 → 180). Las Features de las que dependen historias que podrían promoverse pronto (FEAT-06b, FEAT-10c, FEAT-T5b, FEAT-03b) **no** se tocan: siguen con milestone.

## Cómo liberar el cupo en Linear

Las herramientas del agente no pueden archivar ni borrar issues; lo hace el humano:
1. Linear → proyecto OncoLens-1 → issues → vista con **Milestone = sin milestone** (64 issues: las 49 historias de la tabla de arriba con etiqueta `si-hay-capacidad` y las 15 Features de la sección anterior).
2. Seleccionar → clic derecho → **Delete** (la interfaz no ofrece Archive; se restaura 30 días desde *Recently deleted*). Revisa antes que el recuento sea 64 y que ninguna sea FEAT-06b, 10c, T5b ni 03b.
3. Avisar al agente para que cree las issues de `backlog/sprints/S2-arrastre.md`.
