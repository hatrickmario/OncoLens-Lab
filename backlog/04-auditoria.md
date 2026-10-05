# Auditoría del backlog · 2026-10-05 · PRD v1.2 · acotada a FEAT-04 (CAP-04 · Información faltante)

> Segunda corrida piloto. Alcance: `backlog/features/FEAT-04-informacion-faltante.md` y `backlog/features/README.md`. No se leyó `backlog/_piloto-v1/`. Las historias externas con ID provisional (US-T5-xx, US-OL03-01, US-MAN-01, etc.) se tratan como legítimas; solo se señala cuando la dependencia está mal planteada o deja un hueco real.

## Veredicto

**Publicable (pasa el gate):** no hay violaciones de invariantes y todos los requisitos del alcance de CAP-04 tienen al menos un AC. Ahora bien, AC-04.1 ("registrarlo a mano" desde todo Faltante) queda **debilitado** para 9 de los 12 ítems de mama, la próstata no tiene destino resuelto para TNM e ISUP a la vez, y las pruebas E2E dependen de fixtures y de un catálogo de test que Compose no sabe cargar.

| Alta (bloquean) | Media (`needs-refinement`) | Baja | Preguntas |
|---|---|---|---|
| **0** | **18** | **14** | **9** |

---

## 1. Cobertura (alcance CAP-04)

Primero los parciales; no hay requisitos sin cobertura.

| Requisito | Feature | Stories · AC | Estado |
|---|---|---|---|
| AC-04.1 (Y: "desde un Faltante puede cargar un documento **o registrarlo a mano**") | FEAT-04 | US-002 AC-1/2 · US-003 AC-1/2 · US-004 AC-1, AC-2, AC-3 | **Parcial**: "Registrar a mano" solo para `ClinicalAttribute` y `PriorTreatment` (US-004 AC-3, asumido). Ver M-01 |
| AC-04.3 (Y: aparece en Base del análisis y como "Desconocido: falta en el paciente") | FEAT-04 | US-006 AC-1 (viaja); 🔗 Produce → US-T2-01 (S3), US-CAP08-01 (S4) | Cubierto en FEAT-04 lo que le corresponde; el resto, en las historias consumidoras (legítimo) |
| FR-23 inciso "matriz ítem → campo" (próstata) | FEAT-04 | US-001 AC-7 + Pendiente ISUP | **Parcial**: TNM e ISUP de próstata comparten un único `staging_system` (ver M-02) |
| FR-23 · Comportamiento 1 (4 estados) | FEAT-04 | US-002 AC-1, 2, 4, 7 · US-004 AC-1 | Cubierto |
| FR-23 · 2 (aviso previo, no bloquea) | FEAT-04 | US-005 AC-1…AC-4 · US-006 AC-3 | Cubierto |
| FR-23 · 3 (viajan como "desconocido") | FEAT-04 | US-006 AC-1, AC-3, AC-4 | Cubierto (lo que hace Backend 2 con ellos → US-CAP06-01) |
| FR-23 · 4 (determinismo sin LLM) | FEAT-04 | US-002 AC-5 | Cubierto |
| FR-23 · 5 (destino en el modelo, R-02) | FEAT-04 | US-001 AC-1…AC-4 | Cubierto |
| FR-23 · 6 (reglas en catálogo, validadas por el oncólogo; lista inicial) | FEAT-04 | US-001 AC-5, AC-7 · US-002 AC-6 · DEC-01 | Cubierto (AC-7 no verificable, ver M-10) |
| HU-18 | FEAT-04 | US-002…US-006 | Cubierto |
| AC-04.2 | FEAT-04 | US-005 AC-1…AC-3 · US-006 AC-3 | Cubierto |
| AC-04.4 | FEAT-04 | US-002 AC-5, AC-6 · US-006 AC-4 · DEC-01 AC-4 | Cubierto |
| AC-04.5 | FEAT-04 | US-001 AC-1, AC-2, AC-3 | Cubierto |
| M-04.1 / M-04.2 | — | 🔗 Medido en US-T5-01 | Delegado; sprint de US-T5-01 sin fijar (M-13) |
| M-04.3 (gobierno) | FEAT-04 | DEC-01 (dueño: oncólogo asesor) | Cubierto; la evidencia de la firma es autodeclarada (M-05) |
| TBD-12 | FEAT-04 | DEC-01 (Q1–Q9) | Cubierto |
| RN-07 | FEAT-04 | US-002 AC-3 (asumido) | Cubierto |
| RN-11 | FEAT-04 | US-006 AC-6 · 🔗 Regresión → US-OL03-01 | Cubierto |
| RN-15 | — | 🔗 Regresión → US-RN15-01 (S5) en US-003 y US-006 | Correcto (control de S5) |
| RN-17 | — | 🔗 Regresión → US-RN17-01 (S4) en US-006 | Correcto; falta en US-004 (B-13) |
| RN-20 | FEAT-04 | DEC-01 AC-1 · US-003 AC-6 | Cubierto; supuesto no registrado (M-16) |
| RN-22 | FEAT-04 | US-002 AC-6 · US-001 (condiciones declarativas) | Cubierto: no hay valores a calibrar fijados en código |
| RN-26 | FEAT-04 | US-005 AC-2, AC-5 · US-006 AC-3 · 🔗 Regresión → US-T3-01 | Cubierto |
| RN-27 | FEAT-04 | Solo una nota `Pendiente` de US-002 (sin AC) | Sin violación; la interacción con el checklist no está especificada (M-09) |
| RN-29 | FEAT-04 (dueña) | US-001 AC-1…AC-4 · DEC-01 AC-2 | Cubierto desde S3; hueco en S1–S2 (M-12) |
| AC-T1.1 | FEAT-04 | US-003 AC-3 · US-004 AC-4 | Cubierto; faltan la página y el origen "regla" (M-03) |
| AC-T1.4 | FEAT-04 | US-006 AC-2 | Cubierto |
| AC-T2.1 / AC-T2.2 (inciso b) | — | 🔗 Produce → US-T2-01 · US-006 AC-2, AC-5 | Correcto (FEAT-04 produce, T-2 muestra) |
| AC-T3.3 (faltantes) | FEAT-04 | US-005 AC-2 · US-006 AC-3 · 🔗 US-T3-01 | Cubierto |
| AC-T4.2 | — | No aplica directamente (no hay entidades nuevas en FEAT-04) | N/A |
| AC-T4.3 | FEAT-04 | US-006 AC-6 | Cubierto |
| AC-T5.1 (M-04.x) | — | 🔗 US-T5-01 | Delegado |
| AC-T5.4 (catálogo) | — | 🔗 US-T5-02 desde US-001 | Delegado |

**Conteo (alcance acotado):** FR-23 1/1 (6/6 incisos, 2 parciales) · HU-18 1/1 · AC-04.x 5/5 (AC-04.1 parcial) · M-04.x 3/3 (2 delegados) · TBD-12 1/1 · RN aplicables 9/9 (RN-07, 11, 15, 17, 20, 22, 26, 27, 29; RN-27 sin AC) · AC-T aplicables 8/8. Las demás capacidades quedan fuera de esta corrida.

---

## 2. Hallazgos Alta (bloquean la publicación)

Ninguno. Revisé estas invariantes: datos reales (solo fixtures sintéticos, `data_origin = sintetico`) · `rag-orchestrator` sin datos clínicos (no cambia; los faltantes viajan como claves del catálogo) · RN-10/RN-11 (US-006 AC-6) · RN-06 (US-006 AC-7, contexto técnico) · RN-23 (textos nuevos con 🔗 Regresión) · RN-26 (nada bloquea) · RN-27 (no se asigna ningún concepto inventado) · RN-22 (ningún umbral en el código) · D-01 (sin "recomendación", `recommendations[]` ni `/platform/rag/query`: `grep` vacío) · RN-15/RN-17 (como regresión con su sprint).

---

## 3. Hallazgos Media y Baja

| # | Crit. | Tipo | Ítem | Hallazgo (evidencia) | Qué lo arreglaría |
|---|---|---|---|---|---|
| M-01 | Media | AC no fiel al PRD · inconsistencia | US-004 AC-3 · dependencia US-MAN-01 | AC-04.1 (PRD l.1060) exige "registrarlo a mano" desde **un** dato Faltante. US-004 AC-3 (asumido) limita la acción a `ClinicalAttribute` y `PriorTreatment`, así que en mama quedan sin registro manual 9 de 12 ítems (biomarcadores y campos de `Diagnosis`). Además, US-004 declara ↪ US-MAN-01 (bloqueante), una historia sin Feature ni sprint ("por decidir"), mientras su AC-3 está pensado para funcionar sin ella: la dependencia está declarada en un sentido y diseñada en otro. | Resolver P-01. Si va en S3: asignar US-MAN-01 a una Feature (CAP-02) en S3 y que US-004 AC-3 ofrezca "Registrar a mano" en todo ítem. Si no: registrar el debilitamiento de AC-04.1 como decisión con dueño, quitar el ↪ y dejar un 🔗 al sprint futuro. |
| M-02 | Media | conflicto no registrado · ambigüedad mal encuadrada | US-001 AC-7 (Pendiente ISUP) · DEC-01 Q5 | La nota pregunta si ISUP va a `Diagnosis.grade` "dado que `staging_system`/`stage_value` ya guardan el TNM". Pero readme §3.2 (l.1095) y CLAUDE.md dicen lo contrario: en próstata, `staging_system`/`stage_value` cubren el **grupo ISUP**, y el seed (b) de OL-01 solo tiene ISUP 3. Como PRD FR-23/§18.3.4 piden **TNM e ISUP** en próstata, uno de los dos no tiene destino (RN-29). Es un conflicto entre fuentes que puede exigir un cambio de esquema (OL-01: "esquema completo" desde el S1), no una duda de catálogo que "solo bloquea `isup`". | Moverlo a `## Conflictos de fuentes` (C5: readme §3.2 frente a PRD FR-23). Reformular la pregunta como "¿dónde va el TNM (o el ISUP) de próstata?", con dueño Ingeniería + oncólogo. Bloquea US-001 AC-7 (próstata), DEC-01 y la validación RN-29 de próstata. |
| M-03 | Media | AC no verificable · conflicto incompleto | US-003 AC-3 · C2 | AC-3 exige `provenance` con "página si viene de un documento", pero el schema `Provenance` de readme §4.1 (l.1470-1478) no tiene campo de página, y C2 solo registra que se agrega `provenance` al ítem. Además, AC-T1.1 (PRD l.1306) incluye "regla" como origen, y AC-3 no dice qué origen llevan los ítems `no_aplica` (ni los `faltante`, que también salen de una regla). | Ampliar C2 (agregar `page` a `Provenance` o tomarla de otra fuente) y añadir a AC-3: "ítem `no_aplica` → origen `regla` con la condición del catálogo". |
| M-04 | Media | vacío · ownership | DEC-01 AC-1, AC-3, AC-4 vs US-001 | DEC-01 exige que `catalog:validate` verifique el bloque `validation`, el `catalogHash` y los ítems `pendiente`, pero ninguna historia técnica lo implementa: los AC de US-001 no lo incluyen y DEC-01 (2 pts) es una sesión de revisión. | Añadir esos tres AC a US-001 (y reestimar) o crear una historia técnica que los posea. Que DEC-01 solo los consuma. |
| M-05 | Media | AC de gobierno no verificable | DEC-01 AC-1 | `status = "firmado"`, `role` y fecha son un bloque JSON que cualquiera puede escribir. Ningún AC comprueba que el oncólogo asesor de verdad aprobó (M-04.3 es un medible de gobierno). | Exigir un artefacto de aprobación verificable sin PII en el repo (p. ej., referencia a un acta custodiada fuera del repo, o aprobación del PR por la cuenta designada) y un AC que compruebe que existe. |
| M-06 | Media | AC no verificable · fixtures | US-004 (todos los AC E2E), US-005 AC-1…AC-4 | Los E2E "contra Compose con F-M2/F-M1" dependen de fixtures declarados solo en `apps/clinical-api/test/fixtures/completeness/` y del catálogo `test-1.0.0`. El seed de Compose es el de OL-01 y no incluye F-M1/F-M2. Además, si `clinical-api` monta `test-1.0.0` y `rag-orchestrator` otra versión, el análisis de US-005 AC-2/AC-4 responde `409 CATALOG_VERSION_MISMATCH` (ADR-38, readme l.2891). | Declarar en el contexto técnico cómo se cargan los fixtures y el catálogo de test en el entorno E2E (perfil de Compose de test, mismo catálogo montado en ambos backends) o reescribir los E2E sobre los semillas de OL-01, afirmando solo lo que OL-01 define. |
| M-07 | Media | AC débil · incertidumbre no declarada | US-005 AC-5 | Si `/completeness` responde `5xx`, el aviso se omite **en silencio** y el análisis se registra con `continueWithWarning = false`, aunque el servidor sí calcule y persista faltantes (US-006). La Base del análisis mostraría "faltantes" y "no continuó con aviso" sin que el oncólogo los haya visto: contradice PP-5 y AC-04.2 ("el sistema lista los faltantes"). | Mostrar "No se pudo verificar los datos críticos" con la opción de continuar, y definir qué valor de `continueWithWarning` se registra en ese caso. |
| M-08 | Media | vacío (borde de dependencia caída) | US-006 | Ningún AC define qué hace el gateway si `CompletenessService` falla durante el análisis: ¿`5xx`? ¿analiza sin `missingCriticalData`? En una historia de IA se exige el borde de dependencia caída, y el caso afecta a RN-26 y a AC-T1.4 (reproducibilidad). | Resolver P-03 y añadir el AC correspondiente. |
| M-09 | Media | Pendiente mal clasificado | US-002 (notas "ausencia confirmada" y "biomarcador `no_mapeado`") | Las dos notas dicen "bloquea: nada", pero ambas generan falsos faltantes y por tanto afectan a M-04.2 (especificidad ≥ 0,90) y a US-T5-01. La primera puede exigir además un campo nuevo en el modelo (RN-29). La regla de RN-27 sobre un biomarcador `no_mapeado` no tiene ningún AC. | Declarar que bloquean M-04.2/US-T5-01 (y el esquema, en el caso de la ausencia confirmada). Añadir un AC asumido para `no_mapeado` (p. ej., queda `faltante`, con contador o enlace a la revisión de mapeos de HU-17). |
| M-10 | Media | AC no verificable | US-001 AC-7 | "Exactamente las claves de la lista inicial de FR-23" sin enumerar las claves: el PRD da etiquetas, y la correspondencia etiqueta → clave no está definida ("Tipo histológico · grado" son dos claves; "HER2 (IHQ; ISH…)", otras dos). No hay conjunto esperado contra el cual afirmar. | Enumerar en el AC el conjunto exacto de claves esperadas por tipo de cáncer. |
| M-11 | Media | ambigüedad | US-001 (esquema `destination`) · fixture `test-1.0.0` | La convención del readme es `name = "HER2"` con el método en el valor ("3+ (IHQ)", l.1549 y l.2259). El fixture distingue ISH con un nombre propio ("HER2 ISH") y evalúa la condición por el prefijo de texto "2+". Ninguna fuente define cómo se distingue IHQ de ISH en `Biomarker` ni el formato de los valores, y el destino de `her2_ish` queda ambiguo, pese a que RN-29 exige un campo real. | Nota `Pendiente` (dueño: Ingeniería + oncólogo · bloquea: `her2_ish`, `her2_ihq`, RN-29), con propuesta de match por LOINC o `examType`. |
| M-12 | Media | dependencia mal planteada | US-001 · US-CAT-01 | El catálogo se usa desde el S1 (US-CAT-01) y en el S2 (extracción de `ClinicalAttribute` según el catálogo, OL-05), pero el validador de RN-29 llega en el S3. Durante dos sprints puede publicarse un catálogo con ítems sin destino. El writer lo anota como riesgo, sin dueño ni decisión. | Convertirlo en P-09 con dueño Ingeniería o adelantar el validador mínimo (US-001 AC-1/AC-2) a US-CAT-01. |
| M-13 | Media | inconsistencia de sprint | 🔗 Medido en US-T5-01 | El KR4 del S3 del readme (l.2341) exige medir en el S3 la sensibilidad ≥ 0,95 y la especificidad ≥ 0,90 de los faltantes (G-12). US-T5-01 no tiene sprint en el README del backlog. | Fijar US-T5-01 en S3 en la tabla de pendientes, o declarar que el KR4 del S3 queda sin medir. |
| M-14 | Media | vacío | FEAT-04 / FR-12 re-ejecución | FR-23 dice "antes de **cada** análisis". La re-ejecución (`POST …/{id}/rerun`, S4) y el análisis que parte de una plantilla no tienen ningún 🔗 que garantice que los faltantes se recalculan en el servidor y se persisten. | Añadir un 🔗 Produce/Regresión hacia la historia dueña de la re-ejecución (FR-12, S4): recalcular `missing_critical_data` con el estado actual. |
| M-15 | Media | supuesto de alto impacto sin pregunta | US-001 AC-6 | Un catálogo inválido deja **todo** `clinical-api` fuera de servicio (login, ficha, vista de caso), no solo el checklist. Es asumido y no tiene nota. | P-04. |
| M-16 | Media | supuesto no registrado | DEC-01 (nota INVEST) | Afirma que "la demo sintética sigue funcionando con la versión `propuesta`", pero RN-20 habilita un tipo de cáncer solo con el catálogo revisado por el oncólogo. Mama y próstata están habilitados desde el S1. No se registra ni como conflicto ni como supuesto. | P-05; registrar como supuesto o en Conflictos. |
| M-17 | Media | requisito sin AC | US-003 | El p95 de la vista de caso ≤ 2 s (PRD §7, M-02.4) solo aparece en el contexto técnico ("no debe empeorarlo"), sin un AC que lo compruebe. | Añadir 🔗 Regresión [M-02.4] → US-HU15-01, o un AC de rendimiento sobre `/case` con el checklist. |
| M-18 | Media | ambigüedad | US-003 (contexto técnico) | "No se audita como generación con IA" no dice si `GET /completeness` (lectura de datos clínicos) **se audita como acceso**. FR-04 audita cada lectura de la ficha y AC-T1.5 extiende la auditoría a la vista de caso. | P-07. |
| B-01 | Baja | conflicto mal clasificado | C1 | FR-23 sí incluye la regla en su comportamiento ("un ítem sin destino no puede publicarse"); lo único que falta es AC-04.5 en la línea de CA. Es una omisión, no un conflicto. | Reclasificar como nota. |
| B-02 | Baja | conflicto mal clasificado | C4 | Los ejemplos de readme §4.1/§4.2 (`["estado_menopausico","ki67"]`) encajan con el seed (e) de OL-01, que dice explícitamente que (a) sí los tiene. No hay conflicto. | Eliminar C4 o reescribirlo como aclaración. |
| B-03 | Baja | formato | US-003 (contrato propuesto) | `item` con `example: "her2"`, copiado del readme, cuando las claves son `her2_ihq`/`her2_ish`. | Usar una clave real del catálogo. |
| B-04 | Baja | trazabilidad | US-004 AC-5, AC-6 | AC-5 cita RN-26 para la degradación de la vista (RN-26 habla de avisos que no bloquean el análisis). AC-6 está marcado asumido, pero PRD §7 (Accesibilidad) lo respalda. | Quitar RN-26 en AC-5; en AC-6, quitar "asumido" y citar §7. |
| B-05 | Baja | trazabilidad · duplicado | US-006 AC-5 | Cita AC-T2.1 (que trata de mostrar la Base) para algo que es persistencia. `top_relevance_score = null` es comportamiento de RN-02 (OL-02/OL-03) sin la marca 🔗 Regresión. | Citar RN-02 con 🔗 Regresión → US-OL03-01; dejar en el AC solo las aserciones sobre faltantes. |
| B-06 | Baja | inconsistencia | Encabezado de FEAT-04 · README del backlog | Las dependencias de la Feature omiten US-HU04-01 y US-MAN-01, que US-004 declara como ↪. | Añadirlas. |
| B-07 | Baja | trazabilidad | US-004 Non-goals | Atribuye "el contador" de la ficha a FR-04; FR-04 no lo menciona (es `PatientSummary.missingCriticalCount` de readme §4.1). | Citar readme §4.1. |
| B-08 | Baja | ambigüedad | DEC-01 AC-3 · US-001 | DEC-01 usa `estado = "pendiente"`; el esquema de US-001 solo define `"propuesta"`. Los estados del ítem no están definidos. | Definir el enum de `estado` en US-001. |
| B-09 | Baja | AC genérico | US-004 AC-4 | "La fila lo indica con ese texto": el literal no está definido. | Fijar los textos ("Manual", "Corrección"). |
| B-10 | Baja | vacío | US-005 | PRD §7 pide `aria-live` y navegación por teclado en el panel de IA; el aviso nuevo no tiene un AC de accesibilidad. | Añadir un AC equivalente a US-004 AC-6. |
| B-11 | Baja | riesgo de CI | US-002 (fixture F-M2) | La PII sintética "Ana Pérez, CC 1234567" en el repo puede disparar el escáner de PII del CI (RN-14). | Declarar la allowlist de fixtures sintéticos o generar la PII en tiempo de test. |
| B-12 | Baja | ambigüedad | US-002 AC-6 | Solo cambia `CLINICAL_CATALOG_PATH`; no se define la relación con `CLINICAL_CATALOG_VERSION` (readme §1.4). | Aclarar cuál manda o exigir que coincidan. |
| B-13 | Baja | regresión faltante | US-004 AC-2 | "Registrar a mano" crea un registro: falta 🔗 Regresión [RN-17] → US-RN17-01 (activa desde S4) y el manejo del `422` en la UI. | Añadir la marca. |
| B-14 | Baja | AC con dos comportamientos | US-005 AC-2 | "Envía exactamente un POST … **y** el panel muestra el resultado": el segundo comportamiento es vago. | Quitarlo o concretarlo (p. ej., el bloque de resultado se renderiza con `status`). |

**Ítems que llevarán `needs-refinement`:** DEC-01 (M-04, M-05, M-16) · US-001 (M-02, M-04, M-10, M-11, M-12, M-15) · US-002 (M-09, M-11) · US-003 (M-03, M-17, M-18) · US-004 (M-01, M-06) · US-005 (M-06, M-07) · US-006 (M-08, M-14) · FEAT-04 (M-13).

---

## 4. Preguntas (no asumidas)

| # | Pregunta | Por qué no puedo decidirlo | Qué bloquea | Dueño |
|---|---|---|---|---|
| P-01 | ¿El registro manual de biomarcadores y de campos de `Diagnosis` (histología, grado, estadio, ECOG) entra en el S3, o en esos ítems el acceso directo es solo "Cargar documento"? | Ninguna fuente define el endpoint (readme §4.1 no lo tiene; PRD §10 tampoco). | US-004 AC-3; cobertura completa de AC-04.1 | Usuario (PO) + Ingeniería |
| P-02 | En próstata, ¿dónde se guarda el TNM si `staging_system`/`stage_value` guardan el ISUP (readme §3.2)? ¿Va a `grade`, a `ClinicalAttribute` o hace falta cambiar el esquema? | Las fuentes chocan y la solución puede tocar el esquema de OL-01. | US-001 AC-7 (próstata), DEC-01, RN-29 de próstata | Ingeniería + oncólogo (DEC-01 Q5) |
| P-03 | Si `CompletenessService` falla durante un análisis, ¿se analiza sin faltantes (marcando "checklist no disponible" en la Base) o se responde con error? | RN-26 (no bloquear) choca con AC-T1.4 (reproducibilidad) y PP-5. | US-006 (nuevo AC), US-005 AC-5 | Ingeniería + usuario |
| P-04 | ¿Un catálogo inválido deja todo `clinical-api` fuera de servicio o solo deshabilita el checklist y el análisis? | Decisión de disponibilidad no tomada en ninguna fuente. | US-001 AC-6 | Ingeniería |
| P-05 | ¿RN-20 (tipo habilitado solo con catálogo revisado) aplica desde la demo del S3–S4 o solo en G-Piloto? | El PRD no fecha la regla; la nota de DEC-01 lo da por hecho. | DEC-01 (nota INVEST), G-Demo | Usuario (PO) |
| P-06 | ¿Cómo se registra una ausencia confirmada ("sin tratamientos previos", "BRCA no realizado")? | El modelo no tiene la marca (DEC-01 Q8). | M-04.2; posible cambio de esquema; US-002 | Oncólogo + Ingeniería |
| P-07 | ¿`GET /completeness` se audita como lectura de datos clínicos? | FR-04 y AC-T1.5 auditan lecturas parecidas, pero no esta. | US-003 | Ingeniería (dueña de FR-18 / AC-T1.5) |
| P-08 | ¿US-T5-01 (M-04.1/M-04.2) se hace en el S3? | El README del backlog no le da sprint; el KR4 del S3 lo exige. | KR4 del S3, G-12 | Ingeniería |
| P-09 | ¿El validador de RN-29 se adelanta a US-CAT-01 (S1) o se acepta el hueco de S1–S2? | Lo plantea el writer, sin decisión. | US-CAT-01, US-001 | Ingeniería |

---

## 5. Supuestos registrados

| Ítem | AC | Supuesto | ¿Resoluble con las fuentes? | Riesgo si es falso |
|---|---|---|---|---|
| DEC-01 | AC-3 | Un ítem `pendiente` impide firmar | No (decisión de proceso) | Bajo |
| DEC-01 | AC-4 | El hash detecta un cambio posterior a la firma | No; AC-04.4 solo respalda el versionado | Bajo |
| US-001 | AC-5 | Una condición mal formada o sin `whenConditionUnknown` se rechaza | No | Bajo |
| US-001 | AC-6 | Un catálogo inválido impide arrancar `clinical-api` | No → P-04 | **Alto** (caída total) |
| US-002 | AC-3 | Un registro `rechazado` no cuenta como presente | Parcial: RN-07/AC-02.6 lo excluyen del contexto, no del checklist; es extensión razonable | Bajo |
| US-002 | AC-4 | `whenConditionUnknown` por ítem | No → DEC-01 Q4 | Medio (afecta a M-04.1/M-04.2) |
| US-003 | AC-5 | `404 { error, message }` | **Sí**: PRD §10 (forma del error) + FR-04/readme (404 si no existe). Debió citarse, no asumirse | Nulo |
| US-003 | AC-6 | `200` + `cancerTypeEnabled = false` para un tipo no habilitado | Parcial: el patrón de `PatientSummary.cancerTypeEnabled` y el `200 tipo_no_habilitado` del análisis lo sostienen | Bajo |
| US-004 | AC-3 | Registro manual solo para `ClinicalAttribute`/`PriorTreatment` | No → P-01 | **Alto** (AC-04.1 debilitado) |
| US-004 | AC-5 | La vista de caso degrada sin el checklist | No | Bajo |
| US-004 | AC-6 | Accesibilidad | **Sí**: PRD §7 → no es un supuesto | Nulo |
| US-005 | AC-5 | Checklist caído → sin aviso y `continueWithWarning = false` | No → P-03 | Medio (incertidumbre oculta) |
| US-002 | Regla 4 (contexto) | Cuenta el registro más reciente | No (nota al oncólogo) | Medio (M-04.2) |

**Regla "más asumidos que respaldados → `?`":** ninguna historia la cumple (máximo: US-004, con 3/6, y DEC-01, con 2/4). Las estimaciones se sostienen.

**Notas `Pendiente`:** 7. Bien formadas (dueño y bloqueo): US-001 AC-7, US-003 AC-6, US-004 AC-3. Mal encuadrada: US-001 AC-7 (es un conflicto, M-02). Con "bloquea: nada" sin serlo: ausencia confirmada y `no_mapeado` (M-09). Con "bloquea: nada" que debieron ser AC asumidos: US-002 AC-4 y regla de recencia (Baja, incluida en M-09).

**Cruce con PRD §18.6:** SUP-4 (disponibilidad del oncólogo) está bien citado en DEC-01. SUP-5 (LOINC en repo público, TBD-17) afecta al match por LOINC de US-001 y no se menciona: tenerlo en cuenta al resolver M-11.

---

## 6. Críticas de fondo

1. **El valor del checklist depende de algo que FEAT-04 no controla.** Sin registro manual de biomarcadores y de `Diagnosis` (P-01), el "acceso directo" de AC-04.1 se reduce a "subir un PDF" en la mayoría de los ítems. El slicing entrega bien el *detectar*, pero solo a medias el *completar* (RU-10 "carga o registra lo que falta").
2. **El esquema de próstata no aguanta el catálogo.** El modelo genérico de diagnóstico (un `staging_system`) no admite TNM e ISUP a la vez. Es un riesgo de esquema (OL-01 promete esquema final) y hoy está escondido en una nota de catálogo.
3. **DEC-01 tiene más ingeniería de la que declara.** Firma, hash y estados de ítem son lógica del validador, y ninguna historia técnica la posee (M-04). Con 2 pts, DEC-01 cubre la sesión con el oncólogo, pero no esa implementación.
4. **La estrategia de fixtures es buena para unidad e integración y débil para E2E.** F-M1…F-P1 y `test-1.0.0` evitan con acierto el semilla incompleto de OL-01, pero la Feature no dice cómo llegan a Compose ni cómo se evita el `409` de versión entre backends.
5. **Sobrecarga del S3.** FEAT-04 suma 24 pts en un sprint que además lleva híbrida, revisión, conflictos, plantillas, vigencia y Base del análisis (PRD §14). Sin TBD-19 (capacidad) no se puede juzgar, pero conviene recordar que el orden de recorte del PRD no toca CAP-04.
6. **Gate G-Demo.** CAP-04 entra en G-Demo (todos los AC de CAP-01…CAP-11 en verde). M-04.3 vence al cierre del S3 y depende de SUP-4. No hay un plan B explícito si el oncólogo no firma a tiempo (DEC-01 solo dice que "queda en rojo").

---

## 7. Mejoras propuestas (por prioridad, para `backlog-writer`)

1. **US-004 / US-MAN-01:** resolver P-01. Según la respuesta, crear US-MAN-01 en CAP-02/S3 o registrar el debilitamiento de AC-04.1 como decisión con dueño y quitar el ↪ (M-01).
2. **Conflictos:** añadir C5 (readme §3.2 frente a PRD FR-23 en próstata) y reescribir la nota de US-001 AC-7 como P-02 (M-02). Reclasificar C1 y C4 (B-01, B-02).
3. **US-001:** añadir AC para el bloque `validation`, el `catalogHash` y los ítems pendientes; enumerar las claves en AC-7; definir el enum `estado`; nota `Pendiente` sobre IHQ/ISH (M-04, M-10, M-11, B-08).
4. **US-004 / US-005:** declarar la carga de fixtures y del catálogo de test en el entorno E2E, con el mismo catálogo en ambos backends (M-06).
5. **US-003:** añadir `page` a `Provenance` (C2) y el origen `regla` para `no_aplica`; 🔗 Regresión de M-02.4; aclarar la auditoría (M-03, M-17, M-18).
6. **US-005 AC-5 y US-006:** definir el comportamiento con el checklist no disponible, en cliente y en servidor (M-07, M-08).
7. **US-002:** reescribir las notas `Pendiente` con su bloqueo real (M-04.2, esquema) y añadir un AC asumido para `no_mapeado` (M-09).
8. **README del backlog:** fijar el sprint de US-T5-01; agregar 🔗 hacia la historia de re-ejecución (FR-12); completar las dependencias de la Feature (M-13, M-14, B-06).
9. **DEC-01:** pedir un artefacto de aprobación verificable y registrar el supuesto de RN-20 (M-05, M-16).
10. Correcciones Baja: B-03, B-04, B-05, B-07, B-09…B-14.

---

## 8. Alcance de la auditoría

- **Revisado:** FEAT-04 completo (DEC-01, US-001…US-006: 43 AC, 4 conflictos, 7 notas `Pendiente`, tabla de dependencias externas) y el README del backlog.
- **Citas verificadas al 100 %** en los AC de IA y seguridad (US-006 completo; US-003 AC-4/AC-5; RN-11, RN-06, RN-15, RN-17, RN-26 y AC-T4.3), y en los AC que citan AC-04.x, AC-T1.1, AC-T1.4, AC-T2.1, AC-02.6, RN-07, RN-20, RN-22, RN-29, PRD §7, §10, §14 y readme §4.1 (`CaseView.completeness`, `continueWithWarning`, `missingCriticalCount`, `Provenance`), §4.2 (`missingCriticalData`, `catalogVersion`), §3.1 (columnas de `AIAnalysisRecord`, enums `entry_method`/`review_status`), §3.3 #29/#38, OL-01 (seeds a/b/e) y OL-03 (timeout → `504` sin registro).
- **Por muestreo:** citas a AS-IS (P4, JTBD 2, "loop más costoso": correctas), PP-6, G-12 y VM-5.
- **Cálculos comprobados a mano:** los resultados esperados de US-002 AC-1, AC-2, AC-4, AC-6 y AC-7 contra la regla y el catálogo `test-1.0.0` son coherentes (12 ítems; 6 faltantes en F-M2; 5 con `test-1.1.0`).
- **No comprobado:**
  - si las historias externas (US-T2-01, US-CAP06-01, US-CAP08-01, US-T3-01, US-RN15-01, US-RN17-01) cumplirán lo que FEAT-04 les delega, porque no existen todavía;
  - la carga de sprint frente a la capacidad (TBD-19 abierto);
  - la cobertura global (FR, RN, NFR, SEG, IA, CAP/T, HU, OL, TBD fuera de CAP-04), porque está fuera del alcance acotado;
  - el contenido real de `docs/TO-BE.md` y del C4;
  - la búsqueda de referencias rotas (`grep -oE '\b(DEC|ADR|D|R|TBD)-[0-9]+'`) sobre todo el PRD, porque solo verifiqué las que cita FEAT-04 (ADR-29, ADR-38, TBD-12, TBD-13, R-02, D-05; todas existen).
- **Excluido por instrucción:** `backlog/_piloto-v1/`, `01-requisitos.md`, `02-adrs.md` y `03-trazabilidad.md`.
