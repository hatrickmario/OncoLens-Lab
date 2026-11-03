# Demo 4 · Pacientes sintéticos y set de preguntas por estado

Lo **observado** se obtuvo el 2026-11-02 contra el stack `oncolens-demo4` (commit `d8f422e9`, LLM `gemma4:26b-a4b-it-q4_K_M`, API del `web` con la sesión de `doc1@test.local`). El LLM no es determinista: la redacción y el número de opciones pueden variar entre corridas; los **estados por criterio** son deterministas dado lo que cita cada opción.

## 1. Enlaces de los pacientes

Todos sintéticos. Requieren el stack levantado y haber iniciado sesión: `http://127.0.0.1:3000/login` (`doc1@test.local`; contraseña con `cat infra/docker/secrets/seed_doctor_password` dentro de la copia).

| Paciente | Perfil sembrado | Faltantes críticos | Ficha | Análisis |
|---|---|---|---|---|
| **(a)** `P. S. 1.` · 1968 | Mama · carcinoma ductal infiltrante IIA · ECOG 1 · HER2 3+ (IHQ) · RE positivo 80 % · posmenopáusica | **4**: RP, Ki-67, tratamientos previos, BRCA germinal (HER2 ISH «no aplica») | [ficha](http://127.0.0.1:3000/pacientes/0fd028e2-f8b0-56c7-a748-2a4e473d879d) | [análisis](http://127.0.0.1:3000/pacientes/0fd028e2-f8b0-56c7-a748-2a4e473d879d/analisis) |
| **(b)** `P. S. 2.` · 1955 | Próstata · T2cN0M0 · sensible a la castración · PSA 4,2 → 9,8 → 12,4 | **2**: sitios metastásicos, HRR/BRCA | [ficha](http://127.0.0.1:3000/pacientes/175557e5-e90e-59e2-a6d7-020a133b0eb5) | [análisis](http://127.0.0.1:3000/pacientes/175557e5-e90e-59e2-a6d7-020a133b0eb5/analisis) |
| **(c)** `P. S. 3.` · 1972 | Mama · dos diagnósticos (DCIS estadio 0; lobulillar infiltrante IIB, ECOG 1) · solo RP positivo 60 % | **7**: RE, HER2 IHQ, HER2 ISH, Ki-67, estado menopáusico, tratamientos previos, BRCA | [ficha](http://127.0.0.1:3000/pacientes/f020472d-746a-5a6b-adcb-ed929db51788) | [análisis](http://127.0.0.1:3000/pacientes/f020472d-746a-5a6b-adcb-ed929db51788/analisis) |
| **(d)** `P. S. 4.` · 1960 | Mama · ductal infiltrante IIIA · ECOG 1 · sin biomarcadores | **8**: RE, RP, HER2 IHQ/ISH, Ki-67, menopausia, tratamientos previos, BRCA | [ficha](http://127.0.0.1:3000/pacientes/c257f30f-8341-5f51-a219-8e4bca373918) | [análisis](http://127.0.0.1:3000/pacientes/c257f30f-8341-5f51-a219-8e4bca373918/analisis) |
| **(e)** `P. S. 5.` · 1980 | Mama · ductal infiltrante IB · ECOG 0 · HER2 1+ (IHQ) · RE positivo 90 % · sin estado menopáusico | **5**: RP, Ki-67, estado menopáusico, tratamientos previos, BRCA (HER2 ISH «no aplica») | [ficha](http://127.0.0.1:3000/pacientes/1330c8df-29b6-595b-9b68-c5b6ed0e8fee) | [análisis](http://127.0.0.1:3000/pacientes/1330c8df-29b6-595b-9b68-c5b6ed0e8fee/analisis) |

Administrador (no ve datos clínicos): `admin@test.local`, contraseña en `infra/docker/secrets/seed_admin_password`.

## 2. Dónde se puede ver cada estado

| Estado | ¿En vivo (LLM real)? | Dónde |
|---|---|---|
| **Coincide** | **Sí**, si la opción cita el fragmento en inglés de `nci-mama-hp-en` (HER2-positive metastatic) | Pregunta **Q14**, paciente (a) |
| **Parcial** | **Sí**, en la **tabla por fuente** de `10.1093/jnci/djag049` (no en el resumen de la opción) | Pregunta **Q1**, paciente (a) |
| **Desconocido** (dato ausente en el paciente) | Sí | **Q5** con el paciente (e): sin estado menopáusico, el Parcial de Q1 desaparece |
| **Desconocido** (la fuente no lo reporta) | Sí | Casi todas las preguntas (el estado más frecuente) |
| **No coincide** | **No** con este corpus | Solo en **modo fingido** (par 2). Exige una restricción explícita en el texto del estudio («solo», «only», «exclusivamente», «exclusively»), y ningún valor del corpus de la demo la trae (DEC-11) |

## 3. Set de preguntas

`Obs.` = lo que se vio el 2026-11-02. Los números son `Coincide · Parcial · No coincide · Desconocido`. La **tabla por fuente** (criterio a criterio, con la columna «Estudio (valores extraídos de la fuente por IA y verificados contra el fragmento)») está en la tarjeta de la opción; si no la encuentras, el mismo dato viene en `applicability[]` de la respuesta de `/api/evidence-analyses` (sección 6).

### 3.1 Estados distintos de Desconocido

| # | Paciente | Pregunta (exacta) | Resultado esperado | Obs. |
|---|---|---|---|---|
| **Q14** | (a) | *What does the evidence describe about targeted therapy for HER2-positive metastatic breast cancer in patients who previously received trastuzumab, pertuzumab and trastuzumab emtansine?* | **Coincide** en `estado_her2` (HER2 3+ frente a «HER2-positive metastatic breast cancer», elegibilidad) | **Coincide.** `con_evidencia`, 2 opciones (Margetuximab, Tucatinib), ambas **1·0·0·5**; fuente `breast-treatment-pdq` con `estado_her2 → coincide` (19 s) |
| **Q1** | (a) | *¿Qué describe la evidencia sobre el beneficio del tamoxifeno adyuvante en mujeres premenopáusicas y posmenopáusicas con cáncer de mama con receptores de estrógeno positivos?* | **Parcial** en `estado_menopausico` (el ensayo incluye pre y posmenopáusicas; la paciente es posmenopáusica) | **Parcial.** 1 opción (Tamoxifeno) con resumen 0·0·0·6; la fuente `10.1093/jnci/djag049` muestra **0·1·0·5** con `estado_menopausico → parcial` (15 s) |

### 3.2 Comparaciones útiles entre pacientes (misma pregunta)

| # | Paciente | Pregunta | Para qué | Obs. |
|---|---|---|---|---|
| **Q5** | (e) | La de Q1 | El mismo texto con un paciente sin estado menopáusico | `con_evidencia`, 3 opciones (Tamoxifeno, por 5 años, por 10 años), todas 0·0·0·6; la fuente `10.1093/jnci/djag049` queda **0·0·0·6**: ya no hay Parcial (17 s) |
| **Q6** | (c) | La de Q1 | Paciente con casi todo ausente (sin RE, sin menopausia) | 1 opción, 0·0·0·6; la fuente `10.1093/jnci/djag049` también 0·0·0·6 (11 s) |
| **Q7** | (d) | *¿Qué terapias dirigidas describe la evidencia para el cáncer de mama metastásico HER2 positivo?* | Paciente (d) sin biomarcadores frente a la misma pregunta con el (a) (Q2) | 3 opciones, todas 0·0·0·6 (19 s) |

### 3.3 Casos de comportamiento (no de estado)

| # | Paciente | Pregunta | Qué muestra | Obs. |
|---|---|---|---|---|
| **Q12** | (a) | *¿Qué evidencia hay sobre trasplante de médula ósea en leucemia pediátrica?* | **Sin evidencia** (RN-02): sin opciones, sin LLM de generación | `sin_evidencia`, `topRelevanceScore = null` (4 s) |
| **Q10** | (b) | *¿Qué describe la evidencia sobre los inhibidores de PARP en el cáncer de próstata metastásico resistente a la castración con variantes de BRCA1, BRCA2 o ATM?* | **Descartadas** en la verificación | `con_evidencia`, **0 opciones y 2 descartadas** (olaparib; olaparib con abiraterona y prednisona), motivo `afirmacion_sin_soporte` (16 s). Es el caso para ver la sección «Descartadas en la verificación — solo para revisión» y el texto «No hay opciones descritas con soporte verificable en la evidencia recuperada.» |
| **Q3** | (a) | *¿Qué opciones sistémicas adyuvantes describe la evidencia del corpus de la demo para una paciente con cáncer de mama HER2 positivo, receptores hormonales positivos y estadio IIA?* (par 1) | 1 opción y 1 descartada | 1 opción («terapia neoadyuvante», 0·0·0·6) y 1 descartada («terapia preoperatoria»); tres fuentes consultadas, todas 0·0·0·6 (8 s) |
| **Q4** | (a) | *¿Qué describe la evidencia del corpus de la demo sobre los inhibidores de CDK4/6 adyuvantes en una paciente con cáncer de mama HER2 positivo y receptores hormonales positivos?* (par 2) | **Hallazgo H1** (ver §4) | `con_evidencia` con **0 opciones y 0 descartadas** (5 s) |
| **Q16**, **Q18** | (a) | Q16: *What does the evidence describe about the treatment of triple-negative (TNBC) versus hormone receptor-positive breast cancer?* · Q18: *What does the evidence describe about anthracycline-free regimens for early or locally advanced HER2-positive breast cancer?* | Salida del LLM no validable | **HTTP 503 `LLM_OUTPUT_INVALID`**: «El modelo local devolvió una respuesta que no se pudo validar.» (22 s y 13 s). Verificar que la interfaz no muestra detalles internos y ofrece reintentar |
| **Q15** | (a) | *What does the evidence describe for patients with ECOG performance status 0 or 1 who had received at least two previous anti-HER2 regimens?* | Pregunta en inglés que combina ECOG y líneas previas anti-HER2 (causa de la ausencia de evidencia no investigada) | `sin_evidencia` (4 s) |

### 3.4 Otras preguntas observadas (todas con Desconocido)

| # | Paciente | Pregunta | Obs. |
|---|---|---|---|
| Q2 | (a) | *¿Qué terapias dirigidas describe la evidencia para el cáncer de mama metastásico HER2 positivo?* | 3 opciones (trastuzumab y otros; tucatinib; inhibidores de tirosina-cinasas), todas 0·0·0·6. Cita el fragmento en español (`nci-mama-pac-es`), que **no** guarda el valor de elegibilidad: por eso no sale Coincide aquí |
| Q8 | (a) | *¿Qué describe la evidencia sobre el tratamiento del cáncer de mama triple negativo y del cáncer de mama con receptores hormonales positivos?* | 3 opciones 0·0·0·6; relevancia máxima 0,66 (la más baja del lote) |
| Q13 | (a) | *What does the evidence describe about adjuvant endocrine therapy for hormone receptor-positive early breast cancer?* | 2 opciones (Tamoxifen, Endocrine therapy), 0·0·0·6 |
| Q17 | (a) | *What does the evidence describe about tamoxifen in premenopausal and postmenopausal patients with estrogen receptor-positive and HER2-negative breast cancer of luminal A or B subtype?* | 1 opción y 1 descartada; la fuente del ensayo queda 0·0·0·6 |
| Q9 | (b) | *¿Qué describe la evidencia sobre la darolutamida en el cáncer de próstata avanzado?* | 2 opciones (con ADT; con docetaxel y ADT), 0·0·0·6 |
| Q11 | (b) | *¿Qué describe la evidencia sobre el manejo del cáncer de próstata localizado, como la vigilancia activa o la espera vigilante?* | 2 opciones (conducta expectante o vigilancia activa; cirugía), 0·0·0·6 |
| Q19 | (b) | *What does the evidence describe about the treatment of men with clinically localized (stage I or stage II) prostate cancer?* | 3 opciones (watchful waiting, prostatectomía radical, EBRT), 0·0·0·6 |
| Q20 | (b) | *What does the evidence describe about darolutamide in non-metastatic castration-resistant and metastatic hormone-sensitive prostate cancer?* | 2 opciones (nmCRPC; mHSPC), 0·0·0·6 |
| Q21 | (b) | *¿Qué describe la evidencia sobre el cáncer de próstata que se diseminó a las vesículas seminales o a los tejidos cercanos como el recto, la vejiga o la pared pélvica?* | 3 opciones, 0·0·0·6 |

**Próstata:** en las 6 consultas de próstata **no salió ningún estado distinto de Desconocido**. Con el paciente (b) (T2cN0M0, sensible a la castración) no se pudo mostrar Coincide, Parcial ni No coincide.

## 4. Hallazgos de esta exploración (a registrar en el listado)

| ID | Hallazgo | Evidencia |
|---|---|---|
| **H1** | La pregunta exacta del **par 2** (Q4) devuelve `con_evidencia` con **0 opciones y 0 descartadas**. La guía de la Demo 4 la presenta como pregunta de demostración. Falta comprobar qué muestra la interfaz en ese caso (el estado «solo descartadas» no aplica porque no hay descartadas) | `evidenceOptions = []`, `discardedOptions = []`, `omittedClaims = 0` |
| **H2** | El resumen por opción es 0·0·0·6 en casi todas las respuestas en vivo; Coincide y Parcial solo aparecen cuando la opción cita el fragmento concreto que guarda el valor. El Parcial de Q1 está en la tabla por fuente, no en el resumen de la opción | Q1 frente a las demás |
| **H3** | **No coincide** no es reproducible en vivo con el corpus actual: ningún valor lleva un marcador de restricción | Revisión de `data/raw/seed/poblacion-verificada.json` y de `restrictionMarkers` (`solo`, `exclusivamente`, `only`, `exclusively`) |
| **H4** | 2 de 21 consultas (≈ 10 %) terminaron en `LLM_OUTPUT_INVALID` (503) | Q16 y Q18 |
| **H5** | La columna «Faltantes críticos» del **listado** devuelve `missingCriticalCount = 0` para los 5 pacientes, mientras el endpoint de completitud cuenta de 2 a 8. El contador por fila del listado era deuda propuesta de L1D-95 | `GET /api/patients` frente a `GET /api/patients/{id}/completeness` |
| **H6** | El paciente (a), descrito en la guía como «mama HER2+ completa», tiene **4 faltantes críticos** (RP, Ki-67, tratamientos previos, BRCA germinal) | `completeness` |
| **H7** | Latencia observada de 4 s (sin evidencia) a 40 s (Q21); la primera consulta con el modelo en frío tardó 15 s | Tiempos por consulta |
| **H8** | **Dos mecanismos distintos dan «0 opciones»** y la interfaz los anuncia igual («Análisis listo: 0 opciones descritas»). **(A)** el generador devuelve 0 opciones (Q4: `opcionesGeneradas=0`, solo 4 fragmentos sobre el umbral). **(B)** el generador propone opciones pero la verificación las descarta todas por `afirmacion_sin_soporte` (consulta HER2 metastásico en español, 22:34 y 22:35 UTC: 2 opciones, 6 afirmaciones, 2 descartadas). En (B) el cuerpo sí explica el motivo, pero la línea de estado no | `anunciarOpcionesListas` (`apps/web/lib/evidence/anuncio-de-estado.ts`) se reutiliza para `con_opciones`, `solo_descartadas` y `sin_opciones` con `n = evidenceOptions.length` |
| **H9** | **Misma pregunta, resultado distinto: causa Unicode.** Las 3 ejecuciones del usuario con 0 opciones traían la pregunta en NFD (acentos descompuestos, 206 caracteres frente a 202). Con texto NFC: 57/57 idénticas (25 con caché caliente, 25 vaciada). Con NFD: 3 resultados distintos de A y variables entre sí | `estabilidad/analisis-estabilidad.md` y `estabilidad/cincuenta.jsonl` |

## 5. Cómo ver un No coincide (modo fingido)

El **par 2** del modo fingido es el único camino reproducible. Responde con el ejemplo fijo `contracts/examples/rag-query-demo-s4-mama-cdk46-excluyente.json`:

| Criterio | Estado |
|---|---|
| `estado_her2` | **No coincide** (excluyente) |
| `receptores_hormonales` | Coincide |
| `estadio` | Parcial |
| `estado_menopausico` | Parcial |
| `linea_tratamiento`, `ecog` | Desconocido (`no_reportado_por_fuente`) |

Resumen **1·2·1·2**, `populationNotComparable = true` y el aviso «Según los datos registrados, al menos un criterio excluyente del estudio no coincide con este paciente. La opción se muestra igualmente.» (RN-26: no se oculta ni se bloquea).

```bash
cd <raíz de la copia del proyecto>
scripts/e2e/ejecutar.sh -- --grep "US-247"
```

El par 1 fingido (**1·2·0·3** y **1·0·0·5**) muestra Coincide y Parcial a la vez: opción 1 con `estado_her2 → coincide` y `receptores_hormonales`/`estadio → parcial`; opción 2 con `receptores_hormonales → coincide`.

## 6. Reproducir una consulta sin la interfaz

```bash
cd <raíz de la copia del proyecto>
curl -s -c /tmp/c.txt -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:3000' \
  -d "{\"email\":\"doc1@test.local\",\"password\":\"$(cat infra/docker/secrets/seed_doctor_password)\"}" \
  http://127.0.0.1:3000/api/auth/login
curl -s -b /tmp/c.txt -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:3000' \
  -d '{"patientId":"0fd028e2-f8b0-56c7-a748-2a4e473d879d","query":"<pregunta>","questionTemplateId":null,"continueWithWarning":true,"sourcesSelected":{"guias":true,"ensayos":true,"publicaciones":true}}' \
  http://127.0.0.1:3000/api/evidence-analyses | python3 -m json.tool
```
