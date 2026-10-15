# S1 · Cuestionario de validación clínica para los oncólogos asesores

> Preparado en `/sprint-start S1`, el 2026-10-14. Va dirigido a los oncólogos asesores A y B. El moderador, el usuario, anota cada respuesta y la registra como `[S1 resp. 24+]` en [`S1-plan.md`](S1-plan.md) §6. Ya están aprobados el checklist de "caso reconstruido" (VM-1) y las herramientas de la condición manual (VM-2) de DEC-02 `[S1 resp. 24]`.
>
> **Reglas de la sesión:** solo se usan casos sintéticos. No se mencionan pacientes reales, nombres ni documentos (RN-13, RN-14), y las respuestas se registran por rol, nunca por nombre.

Cada pregunta trae una **propuesta del equipo**. Basta con responder "de acuerdo" o con la corrección.

## A. Protocolo del baseline (US-075, antes de las sesiones)

| # | Pregunta | Propuesta | Respuesta |
|---|---|---|---|
| A1 | ¿Cuál es el **tiempo máximo por tarea** (`VM_SESSION_MAX_MINUTES`)? Si se supera, la tarea queda como "no completada" | 30 min por tarea (VM-1 y VM-2 por separado) | |
| A2 | ¿Son plausibles los **4 casos ficticios** (`mama-02/03` y `prostata-02/03`)? Los prepara el equipo en la oleada 7 y deben estar clínicamente coherentes: diagnóstico, estadio, biomarcadores, tratamientos previos y línea actual | Revisarlos impresos antes de la primera sesión | |
| A3 | ¿Son correctas las **respuestas esperadas** del checklist de cada caso? El moderador las usa para marcar "reconstruido" | Validarlas junto con A2 | |
| A4 | ¿Es adecuada la **pregunta de referencia** de cada caso para VM-2? Para `mama-01`: "¿Qué opciones adyuvantes describe la evidencia para cáncer de mama HER2 positivo en estadio IIA?" | Una pregunta por caso, en el mismo estilo descriptivo | |
| A5 | En VM-2, ¿qué cuenta como "**evidencia aplicable encontrada**"? | Que el participante señale ≥ 1 fuente que considera aplicable y diga en una frase por qué; no se juzga si acertó | |

## B. Textos que verá el oncólogo en la demo del S1

| # | Texto o comportamiento | Propuesta | Respuesta |
|---|---|---|---|
| B1 | Rótulo de la relevancia: **"Relevancia de la evidencia"**, con la nota "no mide eficacia ni solidez clínica" | Mantener | |
| B2 | Con una sola opción en el S1, el orden se explica como "**por relevancia de la búsqueda**" (el orden por aplicabilidad llega en el S5). ¿Se entiende que no es un juicio clínico? | Mantener, con el criterio visible | |
| B3 | La relevancia de una opción es **la de su cita más relevante**, no una medida de la opción. ¿Se entiende así? | Mantener y explicarlo en la ayuda | |
| B4 | Sección plegada **"Descartadas por falta de soporte — solo para revisión"**, con los motivos: "La cita no corresponde a un fragmento recuperado", "Una afirmación no tiene soporte en la fuente o contenía lenguaje no permitido", "La opción no incluye citas a fragmentos recuperados" y "Solo la respalda un análisis previo, que no es evidencia" | Mantener | |
| B5 | Cuando se retira una frase por lenguaje no permitido, aparece **"[afirmación retirada: formulación no permitida]"** | Mantener | |
| B6 | Supuesto fijo de la Base del análisis en el S1: **"Datos del paciente enviados como contexto: detalle y faltantes no evaluados en esta versión."** | Mantener | |
| B7 | Mensajes de error: "El modelo local no está disponible. No se muestra ningún resultado parcial." · "El análisis superó el tiempo máximo de espera. No se muestra ningún resultado parcial." | Mantener | |
| B8 | Aviso fijo en todo resultado: **"Análisis generado por IA: requiere validación clínica del oncólogo tratante"** y la etiqueta **"Uso académico/investigación"** | Ya decidido (PRD B-06); solo confirmar que se lee bien | |

## C. Reglas de lenguaje y de evidencia (RN-23, RN-02)

| # | Pregunta | Propuesta | Respuesta |
|---|---|---|---|
| C1 | La **lista de frases prohibidas** en la salida tiene 22 términos (abajo). ¿Falta alguna formulación prescriptiva habitual en la consulta? | Añadir las que propongan | |
| C2 | Una justificación fiel a la guía con sujeto poblacional ("*patients should receive…*") **descarta la opción entera**. ¿Es aceptable ese falso positivo en el MVP, aunque se mida su tasa? | Aceptarlo: es preferible descartar a prescribir | |
| C3 | "*La guía recomienda X*" **sí puede aparecer** en la síntesis generada, siempre atada a su cita (la raíz `recomend*` solo se prohíbe en los textos propios de la interfaz). ¿Es aceptable? | Aceptarlo | |
| C4 | Si el caso **no tiene diagnóstico registrado**, el sistema responde "sin evidencia" con la limitación "sin tipo de cáncer no se puede filtrar la evidencia", sin consultar al modelo. ¿Es correcto? | Aceptarlo | |
| C5 | La pregunta de prueba "¿Qué describe la evidencia sobre la mortalidad con terapia anti-HER2 adyuvante?" se usa en los tests de la interfaz. ¿Es neutra y realista? | Mantenerla | |

**Lista de frases prohibidas, nivel A (C1).** Se aplica también a sus variantes de plural, género y enclíticos:

- **Español:** recomendado para este paciente · debe recibir · deben recibir · debería recibir · el mejor tratamiento · indicado para usted · tratamiento indicado · se sugiere iniciar · mejor opción · usted debe · probabilidad de éxito · opción preferida · tratamiento de elección · tratamiento óptimo.
- **Inglés:** recommended for this patient · should receive · the best treatment · indicated for you · you should · the patient should · indicated for this patient · chance of success.

## Registro

| Fecha | Participantes (por rol) | Preguntas respondidas | Cambios que generan |
|---|---|---|---|
| 2026-10-14 | Oncólogo asesor A · Oncólogo asesor B | A1–A5, B1–B8, C1–C5 (todas) | `[S1 resp. 26–37]` en [`S1-plan.md`](S1-plan.md) §7: DEC-02 enmendada (criterio de VM-2), PRD E-11 (aviso), rótulos del panel, 422 sin diagnóstico, RN-23 ampliada por forma, traza de auditoría en US-150 AC-7 (S6) |
