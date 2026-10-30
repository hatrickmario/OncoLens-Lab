# S3 · Cierre de la Demo 3 (feedback de la sección 8)

> Creado el 2026-10-29. Recopila las 24 respuestas de [`docs/demo/guia-demo-S3.md`](../../demo/guia-demo-S3.md) §8 (F-01 a F-24), las contrasta con los outcomes de [`S3-demo-outcomes.md`](S3-demo-outcomes.md) y recoge las decisiones clínicas que alimentan el S4 ([`S4-insumo-extraccion-poblacion.md`](S4-insumo-extraccion-poblacion.md)). Complementa `S3-cierre.md` §4 (Review · Demo 3). **Markdown = fuente.** No se ha creado nada en Linear.

## 1. Cómo se leyeron las marcas (confirmar)

La guía define «Verdadero» como «se cumple lo que se espera». En las respuestas, varias marcas «Verdadero» acompañan una nota que **describe el problema** (p. ej. F-01: «llega a `/analisis`», que es lo contrario de lo esperado). Se interpretó así: **«Verdadero» = la observación del problema se confirma**, salvo en las filas donde la expectativa se cumple (F-03, F-04, F-05, F-14, F-21, F-24). La columna «Lectura» lo declara fila por fila; **si alguna lectura es errónea, corregirla aquí antes del refinamiento del S4**. Marcas ambiguas: F-16 y F-19.

## 2. Resultado por pregunta

| # | Marca | Lectura | Nota del usuario / hallazgo |
|---|---|---|---|
| F-01 | Verdadero | Confirma el problema (OUT-01) | El administrador, al entrar, llega a `/pacientes/0fd028e2-…/analisis` |
| F-02 | Verdadero | **Cumple en parte:** hay `403`, pero el aviso no es claro (nuevo **OUT-09**) | Muestra «No se pudo completar el análisis. No se muestra ningún resultado parcial. Código de traza: req_09415dba»; no dice que falta permiso |
| F-03 | Verdadero | Cumple | Vista de administrador: documento enmascarado, estado y alta |
| F-04 | Verdadero | Cumple (con la imagen del seed reconstruida) | Lista de 5 pacientes |
| F-05 | Verdadero | Cumple | Búsqueda por «Sintético» + `SINT-000000n` |
| F-06 | Verdadero | Confirma la carencia | Sin pista cuando el tipo de documento no coincide (mejora menor, sin outcome) |
| F-07 | **Otro** | Decisión de producto | «Ya se agregó feedback de la salida, se debe **avisar y borrar**. Realizar limpieza»: ante estado previo, avisar y ofrecer borrar (OUT-03/OUT-05) |
| F-08 | Verdadero | Confirma la carencia (OUT-04) | `levantar.sh` no verifica el seed |
| F-09 | Verdadero | Confirma (OUT-05) | La imagen del seed no se reconstruye |
| F-10 | Verdadero | Confirma | Attu abierto en `8000` debe cerrarse al terminar |
| F-11 | Verdadero | Confirma el problema (OUT-06) | «El modelo local no está disponible. No se muestra ningún resultado parcial. Código de traza: req_c3af47a6» |
| F-12 | Verdadero | Confirma | Falla determinista |
| F-13 | **Otro** | **Hallazgo nuevo (OUT-08)** | La pregunta de la guía §2.1 responde «No hay opciones descritas con soporte verificable en la evidencia recuperada. Motivos: Una afirmación no tiene soporte en la fuente o contenía lenguaje no permitido» |
| F-14 | Verdadero | Cumple | Ninguna otra pregunta reportada con «modelo no disponible» |
| F-15 | Verdadero | Confirma el incumplimiento | Latencia con evidencia muy por encima de 15 s (NFR; se recalibra en el S5) |
| F-16 | Verdadero | **Ambigua** | La causa del bucle solo se investigó con la pregunta del tamoxifeno; sigue pendiente repetir con ≥ 20 casos (R17) |
| F-17 | Verdadero | Confirma (OUT-07) | Siempre `0·0·0·N` |
| F-18 | Verdadero | Confirma | No reproducible en el sistema real |
| F-19 | Verdadero | **Ambigua** | No queda claro si «Verdadero» significa «se entiende sin ayuda»; validar con oncólogos |
| F-20 | **Otro** | **Decisión clínica que cambia el diseño** (§4) | «Una paciente posmenopáusica coincide con un estudio que incluyó premenopáusicas y posmenopáusicas. En RAG debe clasificarse como `poblacion_match`: parcial/inclusiva. No como coincidencia exacta exclusiva de posmenopáusicas» |
| F-21 | Verdadero | Cumple | Sin restricción explícita, no es «No coincide» |
| F-22 | Verdadero | Cumple, con matiz (§4) | Evaluar sobre los fragmentos citados que sustentan la opción; si el fragmento mezcla poblaciones sin desagregar → match parcial/incierto, no exacto |
| F-23 | Verdadero | Cumple, con matiz (§4) | Mostrar ambos resultados sin resolver el conflicto automáticamente; estado indeterminado; requiere validación clínica/patológica |
| F-24 | Verdadero | Cumple | Hasta 3 valores por criterio con «ver más» |

## 3. Estado de los outcomes tras la Demo 3

| Outcome | Estado | Qué falta para cerrarlo |
|---|---|---|
| OUT-01 Admin aterriza en una pantalla clínica | **Confirmado** | Redirección por rol y rutas `/pacientes/**` protegidas para `admin` |
| OUT-02 Listado `500` (imagen del seed obsoleta) | **Resuelto en esta instalación**; la causa de proceso sigue | `levantar.sh` reconstruye el seed y verifica (OUT-04/05) |
| OUT-03 Volúmenes previos | **Confirmado**; decisión F-07: avisar y borrar | Detección y confirmación en `levantar.sh` |
| OUT-04 Verificar el seed | **Confirmado** | Paso de verificación con conteos |
| OUT-05 Limpieza inicial | **Confirmado**; F-07: «avisar y borrar» | `scripts/demo/limpiar.sh` o paso previo, con confirmación |
| OUT-06 «Modelo local no disponible» | **Confirmado** (determinista) | Etapa 1 (puente) y después etapa 2; repetir la causa con ≥ 20 casos |
| OUT-07 Coincide/Parcial = 0 | **Confirmado** | Datos de demo y metadatos de población (S4) |
| **OUT-08 (nuevo)** Pregunta insignia sin opciones | Abierto | Ver §5 |
| **OUT-09 (nuevo)** Aviso de `403` poco claro | Abierto | Ver §5 |

Ninguno se cierra todavía: son correcciones del S4. Lo que sí queda cerrado es la **verificación**: los hallazgos están confirmados y ya tienen causa o decisión.

## 4. Decisiones clínicas recibidas (alimentan el ADR/DEC del S4)

Estas respuestas **cambian** la semántica propuesta en `S4-insumo-extraccion-poblacion.md` (§2.2 y §2.5). Quedan registradas como **entrada de la DEC**, no como DEC aprobada: falta la validación formal (DEC-01/DEC-11, A-2).

1. **Población inclusiva = Parcial, no Coincide (F-20).** Si el estudio incluyó premenopáusicas y posmenopáusicas, la paciente posmenopáusica está incluida pero la clasificación es `poblacion_match: parcial/inclusiva`. Solo una población específica y exclusiva de su perfil (p. ej. «solo posmenopáusicas») es **Coincide**. *Sustituye* la propuesta «cumple alguno → Coincide».
2. **Fragmentos que mezclan poblaciones (F-22).** La población se evalúa sobre los **fragmentos citados que sustentan la opción**, no sobre el documento. Un fragmento que mezcla poblaciones sin desagregarlas → match **parcial/incierto**, nunca exacto. Confirma R18 y la unidad «fragmento citado».
3. **Valores en conflicto en la fuente (F-23).** Mostrar **ambos** resultados, sin resolver automáticamente, con fecha y muestra si constan (ejemplo: IHQ 3+ frente a IHQ 2+ / ISH no amplificado). Estado: **indeterminado**; «requiere validación clínica/patológica». Confirma A-2 (Desconocido con motivo) y añade la obligación de **mostrar los dos valores**.
4. **Lista incompleta ≠ exclusión (F-21).** No coincide solo con restricción explícita; si no, Desconocido.
5. **Presentación (F-24).** Hasta 3 valores por criterio con «ver más».

**Efecto en el diseño:** la comparación pasa a tener estados más finos (exacto / inclusivo / mezclado / en conflicto) que se proyectan sobre los 4 estados visibles (Coincide, Parcial, No coincide, Desconocido). Hay que decidir si la etiqueta «inclusiva/mixta» se muestra al oncólogo (recomendable, para no ocultar por qué es Parcial) y si el campo interno es `poblacion_match` (nombre usado en la respuesta clínica) o un enumerado del contrato.

## 5. Outcomes nuevos

- **OUT-08 · La pregunta insignia de la guía devuelve «sin opciones con soporte» (F-13).** *¿Qué opciones adyuvantes describe la evidencia para cáncer de mama HER2 positivo en estadio IIA?* con la paciente (a) termina en «No hay opciones descritas con soporte verificable… Motivos: una afirmación no tiene soporte en la fuente o contenía lenguaje no permitido». En la reproducción del 2026-10-29 (`traceId` `req_e276f32f`): `con_evidencia`, `topRelevanceScore` 0,70, **2 opciones generadas y las 2 descartadas** por `afirmacion_sin_soporte` (desescalamiento sin antraciclinas; antraciclinas selectivas), y `omittedClaims` 0. La validación (NLI, RN-01) funcionó como está diseñada, pero la demo principal no enseña ninguna opción. Dos problemas: (a) el recorrido central de la guía §2.1 no produce lo esperado; (b) el mensaje mezcla dos motivos distintos («sin soporte» o «lenguaje no permitido») en una frase, sin decir cuál aplica. **Causa investigada (2026-10-29, detalle en `S3-demo-outcomes.md` OUT-08):** el NLI da falsos negativos sobre justificaciones largas de una sola oración (entailment 0,341 y 0,616 frente al umbral de 0,7) para un fragmento que sí las respalda; influyen el modal normativo («debe»), la hipótesis en español sobre premisa en inglés y el corte del chunk a mitad de oración. Candidato a ser **bloqueante de la demo del S4**.
- **OUT-09 · El `403` del administrador no explica la falta de permiso (F-02).** Muestra «No se pudo completar el análisis. No se muestra ningún resultado parcial. Código de traza: …». El backend responde `403 PERMISO_DENEGADO` («El rol de la sesión no tiene permiso para esta acción»), pero la pantalla usa el mensaje genérico de error. Esperado: texto específico («Tu rol no tiene permiso para generar análisis») distinto del error técnico, sin mostrar contenido clínico. Se resuelve junto con OUT-01.
- **Feedback menor sin outcome (a petición del usuario):** F-06, ayuda en la búsqueda por documento (tipo «Sintético» para los datos de prueba).

## 6. Siguientes pasos

1. **Corregir las lecturas** de la §1 si alguna es errónea (especialmente F-16 y F-19).
2. **Refinamiento del S4:** crear las tareas en Linear **con aprobación del usuario** (lista en `S4-insumo-extraccion-poblacion.md` §10), añadiendo OUT-08 y OUT-09 y la DEC de la §4 de este documento. El workspace de Linear estaba en su límite al cierre del S3.
3. **Antes de la próxima demo:** `levantar.sh` con reconstrucción del seed, verificación y limpieza con confirmación (OUT-03/04/05), y una pregunta con opciones reales para la guía (OUT-08).
4. **Pendiente de medir:** causa del bucle con ≥ 20 casos (R17) y latencia (F-15).
