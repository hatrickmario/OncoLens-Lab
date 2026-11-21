# S7 · Revisión clínica provisional (IA en rol de oncólogo)

> Hecha el 2026-11-21 por el asistente de IA, a petición del usuario (`[S7 resp. 1]`), en el rol de un oncólogo experto.
> **No es la validación de un oncólogo.** Es la base del MVP y se refina después con expertos. Ningún archivo pasa a
> `revision_oncologo` ni a «validada» por este documento: lo revisado aquí se marca `revision_provisional: {rol: ia, fecha: 2026-11-21}`
> y los reportes siguen diciendo `no_validada`.
> Cubre los cuatro pendientes clínicos del S7: DEC-11 (US-021), sinónimos (US-277), los 4 casos de US-140 y el conjunto dorado de US-233b.
> Todo es sintético o de catálogo: no hay datos de pacientes.

Cada hallazgo lleva una gravedad (**Alta**: puede mostrar como aplicable una evidencia que no lo es, o esconder una que sí; **Media**: degrada la medición o la recuperación; **Baja**: mejora) y un destino.

## 1. DEC-11 y los criterios de aplicabilidad

Las reglas F-20…F-24 son coherentes entre sí y con RN-28. Los hallazgos son de cobertura clínica del catálogo, no de la regla.

| # | Gravedad | Hallazgo | Solución propuesta | Destino |
|---|---|---|---|---|
| C-1 | **Alta** | **Próstata: la extensión de la enfermedad no es excluyente.** Solo excluye el estado de castración. Un paciente con enfermedad localizada no tiene estado de castración registrado, así que un estudio de enfermedad metastásica resistente a la castración le sale «Desconocido» en el excluyente y puede ordenarse igual que uno de enfermedad localizada. La diferencia entre localizada (M0) y metastásica (M1) cambia toda la evidencia aplicable. | Marcar `extension` como excluyente **solo** entre localizada/localmente avanzada y metastásica, con una restricción explícita en la fuente (misma condición que F-21). | S7: US-121 (catálogo); requiere `evaluate` |
| C-2 | **Alta** | **Mama: HER2 solo distingue positivo y negativo.** Falta HER2 bajo (IHC 1+, o 2+ con ISH negativo), que es población propia de estudios recientes. Hoy un estudio de HER2 bajo se compara mal con una paciente «negativa». Además, un IHC 2+ sin ISH es equívoco, no negativo. | Añadir la categoría `bajo` como subconjunto de `negativo` (coincide con estudios de HER2 negativo y con los de HER2 bajo). IHC 2+ sin ISH → «Desconocido» y dato faltante. | S7: US-121 |
| C-3 | **Alta** | **F-21 depende de la palabra «solo».** Un criterio de elegibilidad ya es una restricción: un ensayo que incluyó «mujeres posmenopáusicas» excluyó a las premenopáusicas, lo diga o no con «solo». Hoy eso da «Desconocido» y no «No coincide». | No cambiar la regla sin expertos (F-21 la respondieron los oncólogos en la Demo 3). Mientras tanto, mostrar siempre el valor de la fuente junto al estado, y medir en el dorado cuántos casos caen en esta rendija. | Pregunta para expertos (Q-1) |
| C-4 | Media | **Triple negativo es un valor compuesto** (RE−, RP−, HER2−) y aparece como valor de «receptores hormonales». | Proyectarlo en los dos criterios: receptores hormonales = negativo y HER2 = negativo. | S7: US-121 |
| C-5 | Media | **HRR/BRCA agrupa genes con evidencia distinta.** La población con BRCA1/2 y la de otros genes HRR (p. ej., ATM, CDK12) se reportan por separado, y también línea germinal frente a somática. | Valores: `BRCA1/2 mutado`, `otro gen HRR`, `sin mutación`, `no evaluado`. | S7: US-121 |
| C-6 | Media | **Falta el escenario de tratamiento** (neoadyuvante, adyuvante, metastásico; en próstata, recaída bioquímica y volumen o riesgo metastásico). «Línea» y «estadio» no lo cubren. | No añadir criterios en el S7 (cada criterio nuevo exige campo de destino, RN-29). Registrar como candidato. | Post-MVP, con expertos (Q-2) |
| C-7 | Media | **Criterios ausentes en mama:** BRCA germinal y PD-L1. | Igual que C-6. | Post-MVP (Q-2) |
| C-8 | Baja | **ECOG frente a Karnofsky.** No hay tabla de equivalencia; una fuente en Karnofsky no es comparable. | «Desconocido» con motivo `escala_distinta` hasta tener una tabla en el catálogo. | Post-MVP |
| C-9 | Baja | **Sexo y edad no son criterios.** Un varón con cáncer de mama o un paciente muy mayor quedan como si estuvieran representados en el estudio. | Mostrar la edad y el sexo de la población como contexto, sin estado. | Post-MVP |
| C-10 | Baja | **«Parcial» en poblaciones inclusivas (F-20)** puede leerse como «aplica a medias» cuando la paciente sí estaba incluida. | Mantener; el texto del motivo ya dice «población inclusiva». Confirmar con expertos. | Q-3 |

**Veredicto provisional sobre DEC-11:** la regla se sostiene. No se firma: US-021 sigue sin firma de oncólogo. C-1, C-2, C-4 y C-5 entran al catálogo en el S7 como `propuesta`, con versión nueva y evaluación.

## 2. Sinónimos de procedimientos y tratamientos (US-277)

### 2.1 Riesgos al ampliar el catálogo

| # | Gravedad | Riesgo | Regla propuesta |
|---|---|---|---|
| S-1 | **Alta** | **Un término más amplio no es un sinónimo.** «Cirugía» no equivale a prostatectomía; «radioterapia» incluye externa y braquiterapia; «hormonoterapia» significa privación androgénica en próstata y terapia endocrina en mama. Expandir con un término amplio trae evidencia de otra intervención. | Cada entrada lleva `relacion: equivalente \| mas_amplio \| miembro_de_clase`. Solo `equivalente` expande la consulta. |
| S-2 | **Alta** | **Conceptos que se confunden y no son lo mismo:** vigilancia activa (intención curativa diferida) frente a observación o espera vigilante (paliativa); radioterapia adyuvante frente a rescate; castración médica frente a quirúrgica. | Entradas separadas; nunca sinónimos entre sí. |
| S-3 | Media | **Siglas ambiguas.** «RP» es receptor de progesterona en mama y prostatectomía radical en próstata; «PR» también es respuesta parcial. | No añadir siglas de dos letras nuevas. Las siglas viven por tipo de cáncer. |
| S-4 | Media | **Error ya presente en el catálogo:** `pertuzumab ← doble bloqueo anti-HER2`. El doble bloqueo es una combinación, no el fármaco. | Mover a una entrada propia «doble bloqueo anti-HER2» (`mas_amplio`). |
| S-5 | Media | **Falta el nombre estadounidense** de la leuprorelina: *leuprolide*. Es el más frecuente en el corpus en inglés. | Añadirlo. |
| S-6 | Baja | Las tildes y erratas («prostata») no son sinónimos. | Las resuelve la normalización de texto, no el catálogo. |

### 2.2 Lista propuesta (todas `equivalente`, salvo nota)

**Próstata**

| Término canónico | Español | Inglés |
|---|---|---|
| prostatectomía radical | cirugía radical de próstata, extirpación radical de la próstata, prostatectomía radical robótica, prostatectomía radical laparoscópica | radical prostatectomy, robot-assisted radical prostatectomy |
| radioterapia externa | radioterapia de haz externo, RT externa, radioterapia de intensidad modulada | external beam radiotherapy, external beam radiation therapy, EBRT, IMRT |
| braquiterapia | radioterapia intersticial, implante de semillas | brachytherapy, seed implant |
| vigilancia activa | seguimiento activo | active surveillance |
| espera vigilante | observación | watchful waiting, observation |
| terapia de privación androgénica | TDA, deprivación androgénica, bloqueo androgénico, castración médica, análogos de LHRH | androgen deprivation therapy, ADT, medical castration, LHRH agonist, GnRH agonist |
| orquiectomía bilateral | castración quirúrgica | bilateral orchiectomy, surgical castration |
| resistente a la castración | CPRC, hormonorrefractario | castration-resistant, CRPC |
| sensible a la castración | hormonosensible, CPHS | castration-sensitive, hormone-sensitive, CSPC, HSPC |
| recaída bioquímica | recurrencia bioquímica | biochemical recurrence, biochemical relapse, PSA recurrence |
| radioterapia de rescate | — | salvage radiotherapy |
| linfadenectomía pélvica | disección ganglionar pélvica | pelvic lymph node dissection, PLND |
| leuprorelina | leuprolida | leuprorelin, leuprolide |
| incontinencia urinaria | pérdida de orina | urinary incontinence |
| disfunción eréctil | impotencia | erectile dysfunction |
| inhibidores de la vía del receptor androgénico (`miembro_de_clase`) | abiraterona, enzalutamida, apalutamida, darolutamida | androgen receptor pathway inhibitor, ARPI |

**Mama**

| Término canónico | Español | Inglés |
|---|---|---|
| mastectomía | mastectomía total, mastectomía radical modificada | mastectomy, total mastectomy |
| cirugía conservadora de mama | tumorectomía, lumpectomía, cuadrantectomía, cirugía conservadora | breast-conserving surgery, lumpectomy, partial mastectomy |
| biopsia de ganglio centinela | BSGC, ganglio centinela | sentinel lymph node biopsy, SLNB |
| linfadenectomía axilar | vaciamiento axilar, disección axilar | axillary lymph node dissection, ALND |
| quimioterapia neoadyuvante | quimioterapia preoperatoria | neoadjuvant chemotherapy, preoperative chemotherapy |
| quimioterapia adyuvante | quimioterapia posoperatoria | adjuvant chemotherapy |
| terapia endocrina | hormonoterapia, tratamiento hormonal | endocrine therapy, hormone therapy |
| supresión de la función ovárica | supresión ovárica | ovarian function suppression, OFS |
| triple negativo | CMTN | triple-negative, TNBC |
| respuesta patológica completa | RPC | pathological complete response, pCR |
| trastuzumab deruxtecán | T-DXd | trastuzumab deruxtecan |
| HER2 | ERBB2, HER2/neu | ERBB2, HER2/neu |
| inhibidores de aromatasa (`miembro_de_clase`) | letrozol, anastrozol, exemestano | aromatase inhibitor |
| inhibidores de CDK4/6 (`miembro_de_clase`) | palbociclib, ribociclib, abemaciclib | CDK4/6 inhibitor |
| antraciclinas (`miembro_de_clase`, ya existe) | doxorrubicina, adriamicina, epirrubicina | doxorubicin, epirubicin |

«Hormonoterapia» queda como sinónimo dentro de cada tipo de cáncer porque los catálogos son por tipo (S-1); no se comparte entre ambos.

## 3. Los 4 casos de la suite de hasta 3 opciones (US-140)

| Caso | Orden esperado | ¿Coherente con RN-28 y DEC-11? | Observación clínica |
|---|---|---|---|
| OP-01 | doc-a1, doc-a6, doc-a3 | Sí. Las dos fuentes HER2 positivo en estadio I–III van antes que la que no reporta población. | El orden entre doc-a1 y doc-a6 (misma población) depende solo de la relevancia. |
| OP-02 | doc-a1, doc-a3, doc-a4 | Sí. La fuente HER2 negativo queda última con «No coincide» en el excluyente. | La pregunta es genérica («terapia adyuvante») y la cita esperada es solo de anti-HER2. |
| OP-07 | doc-p1, doc-p4, doc-p3 | Sí. La fuente sensible a la castración con ECOG 0–1 va primero. | — |
| OP-08 | doc-p1, doc-p3, doc-p2 | Sí. La fuente resistente a la castración queda última. | **Engañoso como verdad clínica:** se pregunta por privación androgénica con quimioterapia y la única fuente con quimioterapia es de enfermedad resistente. En enfermedad sensible a la castración esa combinación sí está descrita en la literatura; el caso no la representa. |

**Veredicto provisional:** los cuatro órdenes son correctos **como prueba de la regla de orden**. No son casos clínicos: las opciones se llaman «Opción A (test)», las preguntas mezclan español e inglés y las fuentes son plantillas. Por eso no tiene sentido rotularlos «validados por oncólogo» ni siquiera con un oncólogo real.

Solución propuesta:
- Separar dos rótulos en el reporte: `mecanica_verificada` (lo que estos casos prueban) y `validada` (reservado para casos con contenido clínico revisado por un oncólogo).
- Añadir a OP-08 una fuente sintética de enfermedad sensible a la castración con quimioterapia, para que el caso no enseñe una asociación falsa.
- Redactar las preguntas en español completo; el cruce de idiomas ya lo mide la suite de recuperación.

## 4. Conjunto dorado de población (US-233b)

| # | Gravedad | Hallazgo | Solución propuesta |
|---|---|---|---|
| D-1 | **Alta** | **No hay ningún par de próstata.** Los 36 pares son de mama (6 criterios × 6). Estado de castración, extensión, ISUP y HRR/BRCA no se miden. | Añadir ≥ 16 pares de próstata (4 criterios propios × guía, ensayo y revisión × es/en, más ECOG y línea). |
| D-2 | **Alta** | **Todos los textos son la misma plantilla** («Elegibilidad: las pacientes elegibles de esta población tenían…»). La extracción real se equivoca en lo que la plantilla no tiene. | Añadir ≥ 12 casos difíciles, sintéticos, con la redacción habitual de los criterios de elegibilidad: negación («se excluyeron pacientes con ECOG ≥ 2»), rangos («estadio IB–IIIA»), definiciones implícitas («HER2 negativo: IHC 0–1+ o 2+ sin amplificación»), inclusión total («con independencia del estado menopáusico»), umbrales («testosterona < 50 ng/dL») y valores en tabla. |
| D-3 | Media | **Casi no hay distractores:** 3 valores con alcance de subgrupo frente a 39 de elegibilidad, y ninguna mención. La regla «subgrupo y mención no cuentan» queda sin medir. | ≥ 8 casos donde el valor aparece solo en un análisis de subgrupo o en la discusión. |
| D-4 | Media | **Frases sin sentido clínico** («tenían mujeres posmenopáusicas», «receptor hormonal positivo, triple negativo» en la misma cohorte sin decir que es inclusiva). | Reescribirlas; el triple negativo va como en C-4. |
| D-5 | Baja | Los estados F-20…F-23 solo usan estado menopáusico y HER2. | Un caso por regla con un criterio de próstata (castración) y los de C-1 y C-3. |

**Veredicto provisional:** el dorado sirve para probar el cableado, no para medir la extracción. Con D-1 a D-3 mide algo útil; aun así, su revisor sigue siendo «IA, provisional» hasta la revisión humana.

## 5. Preguntas para la sesión con expertos

- **Q-1 (C-3):** ¿un criterio de elegibilidad de un solo valor en un criterio mutuamente excluyente (estado menopáusico, HER2, estado de castración) debe dar «No coincide» aunque la fuente no diga «solo»?
- **Q-2 (C-6, C-7):** ¿qué criterios faltan con más peso: escenario de tratamiento, volumen o riesgo metastásico, BRCA germinal, PD-L1?
- **Q-3 (C-10):** ¿«Parcial» es el estado correcto para una paciente incluida en una población inclusiva?
- **Q-4 (C-1):** ¿la extensión localizada frente a metastásica debe ser excluyente en próstata?
- **Q-5 (§2.2):** revisar la lista de sinónimos, en especial las clases y sus miembros.

## 6. Qué entra al S7 por esta revisión

| Historia | Cambio | Evaluación |
|---|---|---|
| US-277 (L1D-335) | Lista del §2.2 y campo `relacion` (S-1); corrección de S-4 y S-5 | `evaluate` real (cambia catálogo) |
| US-121 (L1D-126) | C-1, C-2, C-4 y C-5 como `propuesta`, con versión nueva del catálogo | `evaluate` real |
| US-140 (L1D-246) | Rótulos `mecanica_verificada` y `validada`; fuente nueva en OP-08; preguntas en español | Suite con adapters falsos y corrida real |
| US-233b (L1D-299) | D-1 a D-5 | Suite `poblacion` con modelos locales |
| US-021 · DEC-11 (L1D-125) | Sin cambios en la regla; sigue sin firma. Se le adjuntan Q-1…Q-4 | — |
