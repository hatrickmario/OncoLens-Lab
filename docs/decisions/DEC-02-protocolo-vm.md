# DEC-02 — Protocolo y metas de las métricas de valor VM-1…VM-6

> Linear: [L1D-51](https://linear.app/l1der-lab-mjbc/issue/L1D-51) · Historia: US-008 · DEC-02 (FEAT-00, Pre-S1) · TBD-11 · R-15

- **Estado:** Decidida (usuario, 2026-10-09) `[Pre-S1 resp. 4, 8]`.
- **Dueño:** usuario (PO), con los oncólogos asesores. **Fecha:** 2026-10-09.
- **Metas congeladas antes del S1.** Este documento declara que **no se modifican después de ver resultados** (R-15). Un cambio de meta exige una nueva DEC, registrada **antes** de la medición a la que aplicaría.

## Cohortes

| Cohorte | Cuándo | Qué valida | Datos |
|---|---|---|---|
| **Sintética** | S1–S5 | La mecánica, más el baseline manual de VM-1 y VM-2 | 6 casos sintéticos estandarizados: 3 de mama y 3 de próstata |
| **Real** | S6, después de G-Piloto | El valor (VM-1 a VM-6) | Casos reales del piloto mixto |

- Las dos cohortes se reportan **por separado**.
- **Las metas de abajo aplican a la cohorte real para G-Éxito.** La sintética las usa como referencia de la mecánica.

## Participantes y sesiones

- **Participantes:** los oncólogos asesores, registrados con **roles anónimos** (“Oncólogo asesor A”, “Oncólogo asesor B”). La correspondencia entre nombre y rol se guarda **fuera del repositorio**, que es público.
- **Baseline manual de VM-1 y VM-2:** en la **semana 2 del S1** (US-075).
- **Orden de las condiciones:** se **contrabalancea** entre participantes. La mitad empieza por la condición manual y la otra mitad por OncoLens.
- **Condición manual en la cohorte real:** se mide sobre **casos reales distintos** de los que se usan con OncoLens `[§15 resp. 6]`.

## Protocolo por métrica

| VM | Qué se mide | Casos y cohorte | Criterio | Orden y herramientas | Muestra y escala | Meta |
|---|---|---|---|---|---|---|
| **VM-1** Tiempo para reconstruir el caso | Sesión cronometrada, manual frente a OncoLens | Sintética (baseline) y real | “Caso reconstruido”: el participante responde el checklist de preguntas del Discovery P1 (diagnóstico, estadio, biomarcadores relevantes, tratamientos previos y línea actual) | Contrabalanceado. Manual: documentos del caso en PDF y la herramienta habitual del participante. OncoLens: el producto, sin otras herramientas | 6 casos sintéticos y todos los reales medidos; mediana por condición | **Reducción de la mediana ≥ 50 %** |
| **VM-2** Tiempo hasta encontrar evidencia aplicable | Desde la pregunta hasta que el oncólogo identifica la evidencia que considera aplicable | Igual que VM-1 | “Evidencia aplicable encontrada”: el participante señala ≥ 1 fuente que juzga aplicable a la pregunta de referencia del caso | Contrabalanceado. Manual: buscadores públicos y fuentes abiertas, sin NCCN ni ESMO, para igualar el corpus. OncoLens: el producto | Una pregunta de referencia por caso; mediana | **Reducción de la mediana ≥ 50 %** |
| **VM-3** Concordancia en aplicabilidad | El oncólogo revisa una muestra de tablas de aplicabilidad | Sintética (DEC-14, S5) y real | Concordancia por criterio. “Parcial” cuenta como acuerdo si el oncólogo también lo marca Parcial | Revisión ciega del estado calculado | Según DEC-14; uno o dos revisores, con su concordancia si son dos | **≥ 85 % de los criterios** |
| **VM-4** Utilidad percibida por análisis | Calificación de 1 a 5 al cerrar cada análisis, opcional y en un clic | Ambas | Pregunta: “¿Qué tan útil fue este análisis?” | — | Escala de 1 a 5; **tasa mínima de respuesta del 60 %** para que la métrica sea válida | **≥ 70 % de los análisis con calificación ≥ 4** |
| **VM-5** Faltantes útiles | Dos casillas al cerrar el análisis: aviso de faltantes **correcto** y **útil** | Ambas | Cuenta como acierto un análisis con las **dos** casillas marcadas | Las casillas van en el mismo formulario que VM-4 | Por análisis con aviso de faltantes | **≥ 80 %** |
| **VM-6** Verificabilidad y no prescripción percibidas | Encuesta al final del piloto | Real | “Pude verificar el origen de lo que me mostró OncoLens” y “Sentí que OncoLens me indicaba qué tratamiento dar” | — | Likert de 5 puntos; acuerdo = 4 o 5 | **≥ 80 % de acuerdo en la primera; ≤ 20 % en la segunda** |

> **Qué está decidido y qué es propuesta.** Las **metas**, la muestra mínima, la tasa de respuesta de VM-4, las cohortes, los roles anónimos y el contrabalanceo los decidió el usuario. Cuatro definiciones operativas son **propuestas de Ingeniería**, a confirmar con los oncólogos en la sesión del baseline (semana 2 del S1), **antes** de medir:
> - el checklist de "caso reconstruido" (VM-1);
> - las herramientas permitidas en la condición manual (VM-2);
> - el tratamiento de "Parcial" (VM-3);
> - qué cuenta como acuerdo en la escala Likert (VM-6).
>
> Confirmarlas no cambia ninguna meta.

## Enmienda del protocolo (validación clínica, usuario, 2026-10-14, `[S1 resp. 24, 26, 27]`)

Los oncólogos asesores A y B aprueban el checklist de "caso reconstruido" (VM-1) y las herramientas de la condición manual (VM-2), y precisan el protocolo. **Las metas no cambian**; cambia el criterio de éxito de VM-2.

- **Tiempo máximo:** 30 min por tarea (`VM_SESSION_MAX_MINUTES`), con VM-1 y VM-2 cronometradas por separado. Si se supera, el intento queda como no completado.
- **Casos:** se validan por coherencia longitudinal (diagnóstico, TNM o estadio a la fecha, biomarcadores, intención terapéutica, secuencia previa y línea actual) y deben tener una única interpretación razonable.
- **Checklist de VM-1:** separa elementos **críticos** y **complementarios**. "Caso reconstruido" exige identificar **todos los críticos**; una reconstrucción parcialmente correcta no cuenta. Cada checklist guarda versión y fecha de validación clínica.
- **Pregunta de referencia de VM-2:** incluye población, contexto clínico, decisión y **fecha de corte** de la evidencia, para que no se responda con evidencia posterior ni de otro escenario.
- **Dos desenlaces en VM-2:** *autoidentificada* (el participante señala ≥ 1 fuente y la justifica brevemente) y *validada* (un evaluador confirma, después y ciego al tiempo y al participante, que la fuente corresponde al caso y a la pregunta). **La meta (reducción de la mediana ≥ 50 %) se calcula sobre los intentos validados**; la autoidentificada se informa al lado.

## Validación de los catálogos por el feedback (P-03)

El feedback por análisis **reemplaza la firma formal** de los catálogos de DEC-01 y DEC-11 `[§15 resp. 5]`:

- El **catálogo de aplicabilidad** se considera validado si VM-4 ≥ 70 % de los análisis con calificación ≥ 4.
- El **catálogo de datos críticos** se considera validado si VM-5 ≥ 80 % “correcto y útil”.
- **Muestra mínima:** con **menos de 10 análisis calificados por tipo de cáncer**, el catálogo de ese tipo queda en `muestra_insuficiente` y no se declara validado ni rechazado. El umbral vive en configuración (RN-22).
- Se mide por versión de catálogo.

## Fuera de esta decisión

- **US-075:** la mecánica de los casos estandarizados, el cronometraje y el cálculo de medianas.
- **FEAT-T5c:** el formulario de feedback.
- **FEAT-T5d:** la medición del piloto.
- **DEC-14:** el tamaño de la muestra de VM-3.
