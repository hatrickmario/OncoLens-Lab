# Pantallas del S4 · hasta 3 opciones, tabla de aplicabilidad con lista de población, motivo de descarte y faltantes

> **Refinamiento del S4 (2026-10-29).** Solo lo que el S4 crea o cambia en la UI, coherente con [`../sistema-de-diseno.md`](../sistema-de-diseno.md) (dirección C «Mesa de trabajo»), [`../S1/pantallas-s1.md`](../S1/pantallas-s1.md) y [`../S3/pantallas-s3.md`](../S3/pantallas-s3.md).
> **Variantes:** S4-01 (hasta 3 opciones con su tabla de aplicabilidad) es una pantalla de **riesgo de UX nuevo** y se presenta con **3 variantes**. S4-02 y S4-03 extienden patrones ya resueltos y tienen un solo diseño.
> **Datos:** solo sintéticos (paciente semilla de mama, sin identificadores reales). Los corchetes se llenan desde el contrato. Textos en `apps/web/messages/es.json` (US-068 recorre la lista de términos prohibidos).
> **Historias:** US-134, US-135, US-126 (con la lista de población de ADR-47 / DEC-11), US-246, US-005, US-003.

## Qué entra y qué sigue recortado

| Elemento | En el S4 | Llega en |
|---|---|---|
| Hasta 3 opciones en el orden recibido, con el criterio de orden visible | **Sí** (US-134, US-135) | — |
| Tabla de aplicabilidad por fuente y criterio, con hasta 3 valores del estudio por criterio, alcance y «ver más» | **Sí** (US-126, ADR-47, DEC-11) | — |
| Opciones con soporte fuera del tope declaradas en la Base | **Sí** (US-134 AC-3) | — |
| Motivo de descarte separado (sin soporte / lenguaje no permitido) | **Sí** (US-246) | — |
| Faltantes antes de analizar, con enlace a la ficha | **Sí** (US-005, US-003) | Enlace a la vista de caso: S5 (US-004, US-090) |
| Avisos de datos sin verificar o en conflicto en la tarjeta | No | S5 (US-101, US-136) |
| Preguntas de seguimiento | No | S5 (US-218, US-219) |

## S4-01 · Hasta 3 opciones con su tabla de aplicabilidad (3 variantes)

**Elementos comunes a las 3 variantes** (no cambian entre ellas):

- Encabezado «Opciones descritas en la evidencia» (RN-23) y `OrderingCriterion` con el texto de aplicabilidad. La clave `evidence.orderCriterion.applicability` del S3 no cambia.
- Cada opción lleva la línea de conteos con símbolo y palabra (`StatusChip`), sin puntaje ni porcentaje, nunca solo color (RN-28), y su `NonBlockingNotice` si `populationNotComparable` (RN-26).
- Las opciones van **numeradas por posición** («Opción descrita 1 de 3»), nunca como «mejor», «primera elección» ni «preferida» (RN-23). El criterio de orden añade: «La numeración indica la posición en el orden por aplicabilidad, no una preferencia.» (H-09)
- Conteos por opción: «Aplicabilidad según la fuente más aplicable de esta opción ([título corto]); otras fuentes pueden diferir ([n]).» (H-04, ADR-31)
- Relevancia al final: «Relevancia de recuperación: 0,82. Metadato de la búsqueda; no mide solidez clínica ni probabilidad, y solo desempata el orden.» (RN-03, H-05)
- `AiDisclaimer` (RN-19) con sus dos textos (validación clínica y «Uso académico/investigación») desde configuración. Va en una banda adherida al pie del panel, visible aunque las 3 tarjetas estén desplegadas (H-17).
- Si `analysisBasis.optionsNotShown > 0`, bajo la última tarjeta aparece: «La evidencia describe {n} opción(es) más con soporte que no se muestran por el límite de 3, aplicado según el orden por aplicabilidad; el límite no es una valoración clínica de ellas. Una pregunta más específica puede mostrarlas.» Es texto, sin el contenido de esas opciones (H-06). El S4 no da otro acceso a ellas.
- **Base del análisis** (FR-27, H-08) declara también: los criterios en Desconocido por dato ausente (`falta_en_paciente`), la versión del catálogo con «Criterios de aplicabilidad pendientes de validación por el oncólogo asesor» mientras DEC-11 no esté firmada, y que puede haber más valores del estudio tras «ver más».
- **Afirmaciones (US-245, H-03):**
  - Las citadas del corpus se muestran como «La fuente reporta que …», o como «En la población del estudio, la fuente reporta que …» cuando la afirmación tiene alcance de población.
  - Las afirmaciones sobre datos del paciente (ADR-34) usan «En los datos registrados: …», nunca «la fuente reporta».
  - El NLI evalúa la afirmación sin el prefijo; el filtro RN-23 corre sobre el texto compuesto. El prefijo no vuelve aceptable una frase prescriptiva.
- **Citas:** numeración por tarjeta, reiniciada en cada opción. Cada número enlaza a su fragmento y los metadatos ausentes dicen «No disponible» (RN-25, H-16). Los extractos copiados del corpus no pasan por el filtro de salida generada de RN-23: el filtro se aplica a lo que genera el modelo (H-20; lo confirma US-245).

**Celda de valor del estudio** (DEC-11, ADR-47), también común:

```
Estado menopáusico · ◐ Parcial · el estudio incluyó varios grupos, entre ellos el del paciente
  Paciente: posmenopáusica                       ← patientValue
  Estudio (valores extraídos de la fuente por IA y verificados contra el fragmento):
            premenopáusicas · Fragmento [1] · posmenopáusicas · Fragmento [2]   ← studyPopulationValues[] (elegibilidad)
            + 1 valor más ▸ ver más
  Contexto (no cuenta para el estado): subgrupo «TNBC» · Fragmento [3]
```

- **Estado:** palabra del estado + motivo de Parcial (`partialReason`, H-11):
  - «el estudio incluyó varios grupos, entre ellos el del paciente»;
  - «el fragmento mezcla poblaciones sin desagregarlas»;
  - «rango parcialmente solapado»;
  - «solo un subgrupo».
- **Desconocido:** siempre dice la palabra del estado y después su causa (H-14):
  - `no_reportado_por_fuente`: «? Desconocido · la fuente no reporta este dato».
  - `falta_en_paciente`: «? Desconocido · falta en los datos registrados», con enlace a la ficha.
  - `valores_en_conflicto`: «? Desconocido · los fragmentos citados muestran valores distintos; se muestran ambos. Conviene contrastarlos con la fuente y con la validación clínica/patológica» (H-12).
  - `varios_valores_en_la_fuente`: muestra los valores (hasta 3) en vez del mensaje de fallo.
  - `respaldo_fallido`: «? Desconocido · no se pudo determinar el valor del estudio; no indica que el criterio coincida ni que no coincida» (H-13).
- **Valores del estudio:** el `value` lo extrae un modelo y se rotula como tal, nunca como cita textual (H-02). El extracto textual copiado del corpus está solo en la `CitationItem` del fragmento (RN-04/RN-25).
- **Fragmentos:** solo se muestran como cita los fragmentos **recuperados en esta consulta** y citados por la opción (RN-01, H-01, ADR-47). Un valor de otro fragmento del documento no se muestra ni cuenta.
- **Contexto:** los valores con alcance subgrupo o mención aparecen bajo «Contexto (no cuenta para el estado)».
- **Leyenda:** «⚑ Criterio excluyente según el catálogo; un No coincide en él se cuenta primero en el orden por aplicabilidad» (H-15).

### Variante A · Tarjetas apiladas con tabla desplegable por opción **(propuesta)**

```
┌ Opciones descritas en la evidencia ─────────────────────────────────┐
│ Criterio: Orden por aplicabilidad … no es una valoración clínica.   │
│ ┌ Opción 1 · [option] ──────────────────────────────────────────┐   │
│ │ [claims: afirmación principal + secundarias, con «La fuente   │   │
│ │  reporta que…» añadido por el código]                          │   │
│ │ Criterios del estudio frente a datos registrados:              │   │
│ │ ✓ Coincide 3 · ◐ Parcial 1 · ✕ No coincide 0 · ? Desconocido 2  │   │
│ │ ▸ Ver aplicabilidad por criterio (fuente: [título corto])      │   │
│ │   ┌ Criterio │ Paciente │ Estudio (≤3 + ver más) │ Estado ┐     │   │
│ │   │ HER2 ⚑   │ positivo │ positivo [1]           │ ✓ Coincide│   │
│ │   │ Menop.   │ posmen.  │ pre [1] · pos [2]      │ ◐ Parcial (inclusiva)│
│ │   │ ECOG     │ —        │ 0–1 [2]                │ ? Falta en los datos registrados│
│ │   └──────────┴──────────┴────────────────────────┴────────┘     │   │
│ │   Otras fuentes de esta opción: [n] ▸ (perSource)              │   │
│ │ Citas … · Relevancia de recuperación: 0,82 (metadato)          │   │
│ └────────────────────────────────────────────────────────────────┘   │
│ ┌ Opción 2 · … (plegada en la misma forma) ┐                          │
│ ┌ Opción 3 · … ┐                                                       │
│ La evidencia describe 1 opción más con soporte, no mostrada (máximo 3). │
│ [AiDisclaimer]                                                        │
└───────────────────────────────────────────────────────────────────────┘
```

- **A favor:**
  - Extiende la tarjeta del S1/S3 sin cambiar el patrón.
  - A 375 px la tabla pasa a una lista por criterio (definición en filas).
  - El detalle no satura: plegado por defecto en todas las opciones, sin destacar ninguna.
  - El orden se lee de arriba abajo con el criterio visible.
- **En contra:** para comparar opciones hay que abrir varias tablas.
- ⚑ marca un criterio excluyente, con la palabra «excluyente» en el `aria-label` y en la leyenda.

### Variante B · Matriz comparativa criterios × opciones

```
┌ Opciones descritas en la evidencia ─────────────────────────────────┐
│ Criterio: …                                                          │
│ ┌ Criterio │ Paciente │ Opción 1       │ Opción 2      │ Opción 3   ┐│
│ │ HER2 ⚑   │ positivo │ ✓ positivo [1] │ ✓ positivo [4] │ ? no rep.  ││
│ │ Menop.   │ posmen.  │ ◐ pre·pos [1,2]│ ✓ pos [5]      │ ✕ solo pre ││
│ └──────────┴──────────┴────────────────┴───────────────┴────────────┘│
│ Debajo, una tarjeta por opción con sus afirmaciones y citas.          │
└───────────────────────────────────────────────────────────────────────┘
```

- **A favor:** la comparación es inmediata en escritorio.
- **En contra:**
  - A 320–375 px exige *scroll* horizontal dentro de un contenedor (el sistema de diseño solo lo admite así), y aun así cinco columnas son inutilizables. Además, las celdas pierden el motivo de Parcial y la causa de Desconocido.
  - Las columnas en paralelo invitan a leer un ranking o una puntuación, en tensión con RN-28 y RN-23.
  - Solo muestra la fuente más aplicable por opción y oculta `perSource`.
  - Duplica la información con las tarjetas.

### Variante C · Pestañas por opción con panel lateral de criterio

```
┌ Opciones descritas en la evidencia ─────────────────────────────────┐
│ [ Opción 1 ] [ Opción 2 ] [ Opción 3 ]        Criterio: …            │
│ ┌ Opción 1 ───────────────────────┐ ┌ Detalle del criterio ───────┐  │
│ │ afirmaciones, conteos, citas    │ │ Menopausia · ◐ Parcial      │  │
│ │ lista de criterios (clic)       │ │ Paciente / Estudio / citas  │  │
│ └─────────────────────────────────┘ └─────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

- **A favor:** pantalla limpia y detalle rico por criterio.
- **En contra:**
  - Las pestañas ocultan que hay varias opciones y su orden, y se pierde la lectura del orden de un vistazo (RN-28 «la UI muestra el criterio de orden»).
  - Más clics y más manejo de foco con teclado.
  - El panel lateral no cabe a 375 px.

**Propuesta de diseño: A.** Es la única que conserva el orden visible, funciona a 375 px sin *scroll* horizontal y no sugiere un ranking. La comparación entre opciones (lo que gana B) se cubre con la línea de conteos de cada tarjeta.

## S4-02 · Motivo del descarte separado (US-246)

Extiende S3-03. Cada motivo tiene su línea y su etiqueta; ya no hay un texto que junte dos motivos.

| `discardReason` | Etiqueta |
|---|---|
| `afirmacion_sin_soporte` | «Una afirmación no tiene soporte en la fuente citada» |
| `lenguaje_no_permitido` (nuevo) | «Contenía lenguaje prescriptivo, que no se muestra» |
| `cita_invalida` · `sin_citas` · `solo_soportada_por_analisis_previo` | Etiquetas existentes de `evidence.discardReason.*` |

En «Descartadas · solo para revisión», la afirmación sin soporte (`unsupportedClaims[]`) se muestra con el rótulo «Afirmación no verificada contra la fuente citada; se muestra solo para revisión», **después** de pasar el filtro RN-23 (H-07). Si el filtro RN-23 del cliente la rechaza, o el backend ya la envió retirada (literales de `support.py`), se lee «(texto no mostrado)» sin el rótulo de afirmación no verificada y se conserva la etiqueta del motivo recibido (enmienda del 2026-10-31, decidido por el usuario). En una descartada `lenguaje_no_permitido` solo se muestra la nota, sin afirmaciones.

Para `lenguaje_no_permitido` se muestra el nombre de la opción (`option`, también filtrado) con la etiqueta «Se omitió por la redacción generada (lenguaje prescriptivo); no es una valoración de la evidencia» (H-19). Nunca se muestra el texto prescriptivo.

## S4-03 · Faltantes antes de analizar (US-005, con US-003)

Sobre el formulario del panel de análisis, antes del botón:

```
⚠ Faltan 2 datos críticos para este tipo de cáncer        (role="status", no bloquea)
  · Estado HER2 → Registrar en la ficha
  · ECOG        → Registrar en la ficha
  El análisis puede hacerse igual; esos criterios saldrán como «Desconocido»
  y el orden por aplicabilidad puede cambiar al registrarlos.
[ Analizar evidencia ]   (siempre habilitado, RN-26)
```

- Los datos salen de `GET /patients/{id}/completeness`: `items[]` con `status = faltante`, la etiqueta del catálogo y `cancerTypeEnabled`.
- «Registrar … en la ficha» enlaza a la **sección ya existente** de la ficha donde vive el dato: `/pacientes/[id]#diagnostico` o `#biomarcadores`, con un encabezado con `id` y `tabindex="-1"` que recibe el foco. Si el dato no tiene sección propia (p. ej., el estado menopáusico), el enlace va al encabezado principal de la ficha `[S4 resp. 14]`. En el S5 se reconecta con la vista de caso.
- Sustituye al diálogo «Cargar información / Continuar con aviso» de `flujo-e2e.md`: el bloque es informativo, y «Analizar evidencia» con faltantes envía `continueWithWarning = true` (US-005).
- Si `cancerTypeEnabled = false`, no se muestra el bloque; ya hay un estado propio de «tipo no habilitado» (S3-01).
- Sin faltantes, no hay bloque.

## Accesibilidad (además del sistema de diseño §4)

Revisión WCAG 2.1 AA del 2026-10-29: A aprueba con correcciones; B y C no recomendadas. Las correcciones quedan aquí:

- **Reflow (1.4.10, M-1):**
  - La tabla pasa a lista según el **ancho del contenedor** (*container query*, < 560 px de tarjeta), no según el *viewport*.
  - Se verifica a 320 px CSS y al 200 % / 400 % de zoom.
  - Una sola estructura DOM con cambio por CSS; si hubiera dos, la inactiva va con `display:none`.
  - Términos completos del catálogo, sin abreviar («Estado menopáusico», «posmenopáusica»); las abreviaturas de las maquetas son solo de espacio (m-3).
- **Estructura (m-4):**
  - `h2` «Opciones descritas en la evidencia» y `h3` por opción.
  - Tabla con `<caption>` «Aplicabilidad por criterio · Opción n · fuente [título]» y orden de celdas: criterio (`th scope="row"`) → paciente → estudio → estado, igual en tabla y en lista.
  - «Contexto (no cuenta para el estado)» va dentro de la celda Estudio, con su rótulo.
  - Las afirmaciones, los conteos y las citas siempre están visibles; solo la tabla se pliega, igual en las 3 opciones (A-1).
- **Símbolos (1.1.1, M-2, m-1, m-2):**
  - ✓ ◐ ✕ ? ▸ ▾ ⚠ → llevan `aria-hidden="true"` y la palabra va visible.
  - ⚑ lleva `aria-hidden` más el texto oculto « (excluyente)» dentro de la cabecera de fila, y la leyenda visible «⚑ = criterio excluyente» encima de la tabla.
  - El valor ausente del paciente se escribe «Sin dato registrado», no «—».
- **Citas [n] (M-3):**
  - Cada [n] es un botón con nombre «Cita n: [sourceName] [externalId]».
  - «Ver fragmento» lleva el foco al `aside` y «Volver a la cita» lo devuelve a ese [n] (flujo del S1).
  - La numeración es por opción.
- **Desplegables (M-4):**
  - «Ver aplicabilidad…», «ver más» y «Otras fuentes» llevan `aria-expanded` y `aria-controls`, y su nombre incluye el contexto: «Ver aplicabilidad por criterio de la Opción 1 (fuente: …)», «Ver 1 valor más del estudio · Estado menopáusico».
  - Lo revelado va justo después del botón; el foco se queda en el botón, que pasa a «ver menos». Se activan con Enter y Espacio.
- **Anuncios (4.1.3, m-5, S3-1):**
  - El excedente de opciones es texto normal, sin `role`, y se suma al anuncio existente del S1: «Análisis listo: 3 opciones descritas; 1 más con soporte no mostrada».
  - El resumen de faltantes se asocia al botón «Analizar evidencia» con `aria-describedby`.
- **Faltantes (S3-2…S3-4):**
  - Lista `ul`/`li`, con enlaces «Registrar Estado HER2 en la ficha».
  - El destino (`#diagnostico`, `#biomarcadores` o el encabezado principal) es un encabezado con ese `id` que recibe el foco.
  - En la ficha, el faltante sigue con ◌ en gris neutro.
- **Descartadas (S2-1):** el ítem de `lenguaje_no_permitido` lleva su etiqueta y la nota de redacción, sin afirmaciones; «(texto no mostrado)» aparece solo cuando se retira una afirmación (filtro RN-23 del cliente o retiro del backend).
- **Objetivos táctiles:** ≥ 44 × 44 px en [n], «ver más» y «Otras fuentes» (área ampliada, sin solapes).
- Contrastes: todos los tokens de estado y de aviso dan ≥ 7:1 (sistema de diseño §1).

## Dato del contrato por elemento (verificación)

| Elemento | Campo | ¿En el contrato? |
|---|---|---|
| Hasta 3 opciones en orden | `evidenceOptions[]` (orden recibido) | Sí |
| Conteos | `ApplicabilitySummary` | Sí |
| Tabla por fuente y criterio | `applicability[].criteria[]` (`criterion`, `patientValue`, `status`, `unknownReason`, `isExclusionary`, `citedSources`) | Sí |
| Otras fuentes de la opción | `evidenceOptions[].perSource[]` | Sí |
| Hasta 3 valores del estudio con alcance y cita | `studyPopulationValues[]` (`value`, `chunkId`, `scope`) | **No: se añade en US-241** (aditivo, ADR-47) |
| Motivo de Parcial | `partialReason` | **No: se añade en US-241/US-243** `[S4 resp. 11]` |
| Desconocido por conflicto, por varios valores o por respaldo fallido | `unknownReason` = `valores_en_conflicto`, `varios_valores_en_la_fuente`, `respaldo_fallido` | **No: se añade en US-241** |
| Excedente de opciones | `analysisBasis.optionsNotShown` | **No: se añade en US-134** `[S4 resp. 7]` `[S4 resp. 11]` |
| Motivo «lenguaje no permitido» | `discardReason = lenguaje_no_permitido` | **No: se añade en US-245/US-246** `[S4 resp. 11]` |
| Afirmaciones con atribución | `claims[]` o `rationale` compuesto por el código | Se define en US-245; si cambia la forma del contrato, va aditiva |
| Faltantes | `GET /patients/{id}/completeness` (`items[]`, `cancerTypeEnabled`) | **No: el endpoint no está en `apps/clinical-api/openapi.yaml`; lo añade US-003** |

## Revisiones

- `clinical-language-auditor` (modo Diseño, 2026-10-29): FAIL condicionado, con 0 violaciones literales de RN-23, 8 mayores, 10 menores y 2 preguntas. A es compatible; B y C son incompatibles (B se lee como ranking, C da primacía a la Opción 1). **Todos aplicados** en esta versión, incluido H-01 (solo se citan fragmentos recuperados en la consulta; corrige también el ADR-47).
- Revisión de accesibilidad WCAG 2.1 AA (2026-10-29): A aprueba con correcciones, B y C no recomendadas, 0 bloqueantes. Correcciones aplicadas en §Accesibilidad.
- Verificación de contrato: 5 campos que el diseño necesita no existen hoy y se añaden de forma aditiva (tabla anterior); quedan en US-241, US-134 y US-245/US-246 `[S4 resp. 11]`.
- Elección del usuario: ver [`../../../backlog/sprints/S4-refinamiento.md`](../../../backlog/sprints/S4-refinamiento.md) §6.
