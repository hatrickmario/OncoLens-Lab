# Pantallas del S3 · estados del panel, criterio de elección y descartadas

> **Refinamiento del S3 (2026-10-24).** Solo lo que el S3 crea o cambia en la UI, coherente con [`../sistema-de-diseno.md`](../sistema-de-diseno.md), [`../S1/pantallas-s1.md`](../S1/pantallas-s1.md) y [`../S2/pantallas-s2.md`](../S2/pantallas-s2.md).
> **Un solo diseño por pantalla:** el S3 **extiende** el panel de análisis ya resuelto en el S1 (tarjeta, `OrderingCriterion`, `DiscardedOptions`, estados mínimos) y no introduce riesgo de UX nuevo. Las pantallas de riesgo nuevo (tabla de aplicabilidad y hasta 3 opciones, vista de caso, faltantes y revisión) llegan en el S4 tras el reordenamiento del 2026-10-23, y allí se presentan con 3 variantes.
> **Datos:** solo sintéticos (paciente semilla de mama). Los corchetes se llenan desde el contrato. Textos en `apps/web/messages/es.json` (fuente única que recorre la lista de términos prohibidos, US-068).
> **Historias:** US-062 (estados y criterio visible, `[S3 resp. 6]`, `[S3 resp. 9]`), US-237 (resumen de descartadas), US-127 (metadatos de la fuente: sin cambio visual frente a `CitationItem` del S1), ARR-09 (aviso de envío antes de hidratar en `/pacientes`).

## Qué entra y qué sigue recortado

| Elemento | En el S3 | Llega en |
|---|---|---|
| Estados completos del panel (espera, sin evidencia, error, `429`, tipo no habilitado, validación) | **Sí** (US-062) | — |
| Criterio de elección por aplicabilidad y línea de conteos | **Sí**, solo texto (US-062 AC-7, con US-125) | Tabla por criterio: S4 (US-126) |
| Resumen por motivo cuando todo se descarta | **Sí** (US-237) | — |
| Progreso por pasos y botón Cancelar | **No**: indicador indeterminado y botón deshabilitado. Corrige la nota de `pantallas-s1.md` (fila "Progreso por pasos"), que lo situaba en el S3 | ADR-42 (S4) |
| Hasta 3 opciones | No (`EVIDENCE_MAX_OPTIONS = 1`) | S4 (US-134) |

## S3-01 · Estados del panel · `/pacientes/[id]/analisis` (US-062)

Llevan `AiDisclaimer` (RN-19) todos los estados con respuesta del análisis: con opción, solo descartadas, sin opciones, **sin evidencia** (también es una salida del sistema) y **tipo no habilitado** (spec vigente de `l1d-194-aviso-ia-etiqueta-academica`: el aviso se muestra con cualquier `status`; decidido, usuario, 2026-10-24, `[S3 resp. 17]`); no lo llevan los errores, la validación ni el `401`, porque no hay respuesta del análisis. Todos llevan y la etiqueta "Uso académico/investigación" de la cabecera. Ningún estado deshabilita la navegación ni el formulario salvo la espera (RN-26).

| Estado | Disparador | Qué se ve | Clave de mensaje |
|---|---|---|---|
| Espera | Petición en curso (también con doble clic) | *Skeleton* de la tarjeta; botón "Analizando…" deshabilitado; "El contenido aparece completo cuando está validado." Una sola petición (AC-1) | `evidence.formulario.analizando`, `.espera` |
| Sin evidencia | `status = sin_evidencia`, `topRelevanceScore = null` | "Ningún fragmento del corpus superó el umbral de relevancia. No se generaron opciones." + "La búsqueda se limita a las fuentes consultadas; no implica que no exista evidencia." (clave nueva `evidence.resultado.sinEvidenciaAlcance`) · "Relevancia máxima: no aplica" (nunca 0, RN-02) · **Qué se buscó:** la pregunta, su idioma y las fuentes consultadas (de la Base del análisis) · Base del análisis visible. Sin tarjeta ni texto con forma de opción | `evidence.resultado.sinEvidencia`, `.relevanciaMaxima`, `.noAplica`; nueva `evidence.resultado.queSeBusco` = "Qué se buscó" |
| Validación | Pregunta > 2000 caracteres | Error junto al campo (`aria-describedby`), contador "2001 / 2000" | nueva `evidence.formulario.maximo` = "La pregunta admite como máximo {max} caracteres." |
| Límite | `429` con `Retry-After: 30` | `NonBlockingNotice`: "Se alcanzó el límite de análisis. Puedes reintentar en {s} segundos." Botón "Reintentar" activo al cumplirse el plazo | nueva `evidence.error.limite` |
| Error | `502`, `503`, `504`, fallo de red | Mensajes del S1 por código y "Código de traza: [traceId]" (`[S1 resp. 31]`); sin nombres de servicios ni trazas de pila; botón "Reintentar" y pregunta conservada | `evidence.error.*` (existentes); nueva `evidence.error.red` = "No hay conexión con el servidor. No se muestra ningún resultado parcial." |
| Sesión expirada | `401` | Redirección a `/login?motivo=expirada`, sin datos del paciente | `login.sesionExpirada` |
| Tipo no habilitado | `status = tipo_no_habilitado` | "Tipo de cáncer fuera del alcance del piloto: sin análisis con IA". Sin tarjeta de opción; **con** `AiDisclaimer` (RN-19, `[S3 resp. 17]`) | `alcance.tipoNoHabilitado` |

## S3-02 · Opción con el criterio de elección (US-062 AC-7 + US-125)

```
┌ Opciones descritas en la evidencia ──────────────────────────────────┐
│ Criterio: Orden por aplicabilidad: primero la opción con menos       │
│ criterios excluyentes en No coincide; luego, la que coincide en más  │
│ criterios con los datos registrados; la relevancia de recuperación   │
│ solo desempata. Es un criterio de orden, no una valoración clínica.  │
│ ┌ 1 · [option] ──────────────────────────────────────────────────┐   │
│ │ [rationale]                                                     │   │
│ │ Criterios del estudio frente a datos registrados:               │   │
│ │ ✓ Coincide 3 · ◐ Parcial 1 · ✕ No coincide 0 · ? Desconocido 2   │   │
│ │ [NonBlockingNotice si populationNotComparable]                  │   │
│ │ Citas … (CitationItem, sin cambios)                             │   │
│ │ Relevancia de recuperación de evidencia: 0,82 (metadato)        │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│ [AiDisclaimer]                                                        │
└───────────────────────────────────────────────────────────────────────┘
```

| Elemento | Texto | Dato del contrato |
|---|---|---|
| `OrderingCriterion` | "Orden por aplicabilidad: primero la opción con menos criterios excluyentes en No coincide; luego, la que coincide en más criterios con los datos registrados; la relevancia de recuperación solo desempata. Es un criterio de orden, no una valoración clínica." Reemplaza a `orderCriterion.relevance` | — (regla RN-28; clave nueva `evidence.orderCriterion.applicability`) |
| Línea de aplicabilidad | "Criterios del estudio frente a datos registrados:" (fuente más comparable) + cuatro `StatusChip` **con símbolo y palabra**, nunca solo color; sin puntaje ni porcentaje; «Desconocido» = dato ausente o no evaluable, con enlace a la Base del análisis | `evidenceOptions[].applicabilitySummary` (conteos por estado) |
| Aviso de población | `NonBlockingNotice`: "Según los datos registrados, al menos un criterio excluyente del estudio no coincide con este paciente. La opción se muestra igualmente." No oculta la opción ni deshabilita nada (RN-26) | `evidenceOptions[].populationNotComparable` · `warnings[] = poblacion_no_comparable` |
| Relevancia | Al final, como metadato secundario (RN-03). **Cambia** `evidence.relevance.basis` («Orden basado en la cita recuperada más relevante…», que contradice el criterio nuevo) por «Metadato de recuperación; solo desempata el orden por aplicabilidad.» | `relevanceScore` |

Fuera del S3: el detalle por criterio (valor del paciente, valor del estudio, causa del Desconocido) y `perSource` se muestran en la `ApplicabilityTable` de US-126 (S4).

## S3-03 · Solo descartadas con resumen por motivo (US-237)

Extiende el estado "Solo descartadas" del S1 (`pantallas-s1.md`, tabla de estados):

```
No hay opciones descritas con soporte verificable en la evidencia recuperada.
Motivos:
  2 × La cita no corresponde a un fragmento recuperado
  1 × La opción no incluye citas a fragmentos recuperados
▸ Descartadas por falta de soporte — solo para revisión   (plegado, sin cambios)
[AiDisclaimer]
```

| Elemento | Regla | Dato |
|---|---|---|
| Titular | Literal existente `evidence.resultado.soloDescartadas` | `evidenceOptions = []`, `discardedOptions ≥ 1` |
| "Motivos:" | Una línea por motivo distinto, "{n} × {etiqueta}", en el orden del enum `discardReason` del contrato; con un solo motivo, sin "1 ×" (AC-1). Etiquetas: las existentes de `evidence.discardReason.*`, sin texto nuevo por motivo (AC-3). Lista `<ul>` con texto; sin identificadores de chunk | `discardedOptions[].discardReason` |
| Clave nueva | `evidence.discarded.motivos` = "Motivos:" | — |

## ARR-09 · Envío de la búsqueda antes de hidratar (`/pacientes`)

Hoy, si se envía el formulario antes de que React hidrate, el navegador muestra el JSON del Route Handler. Diseño: el formulario funciona sin JavaScript como **envío progresivo** (POST del formulario a una ruta que redirige a `/pacientes?…` con el resultado renderizado en el servidor) o, como mínimo, el botón "Buscar" queda deshabilitado con "Cargando…" hasta la hidratación. Recomendado: el envío progresivo, que nunca muestra JSON y no pone la identidad en la URL (la búsqueda va en el cuerpo del POST, nunca en la *query string*). La decisión técnica es de `frontend-dev` dentro de ARR-09; el criterio visible es "nunca se muestra JSON ni la identidad en la URL".

## Accesibilidad (además de la lista del sistema de diseño §4)

- La línea de conteos es texto leído por lectores de pantalla como "Coincide 3, Parcial 1, No coincide 0, Desconocido 2"; los símbolos llevan `aria-hidden` y la palabra es visible.
- Los avisos (`429`, población no comparable) usan `role="status"`; los errores de envío usan `role="alert"`.
- "Reintentar" recibe el foco tras un error; el contador de caracteres se anuncia con `aria-live="polite"` solo al superar el máximo.

## Dato del contrato por elemento (verificación)

| Elemento | Campo | ¿En el contrato? |
|---|---|---|
| Conteos de aplicabilidad | `ApplicabilitySummary` (`contracts/schemas/evidence.yaml`) | Sí |
| Población no comparable | `populationNotComparable` | Sí |
| Motivo de descarte | `discardedOptions[].discardReason` | Sí |
| Relevancia máxima | `topRelevanceScore` (`null` en sin evidencia) | Sí |
| Qué se buscó | pregunta y fuentes consultadas de la Base del análisis (US-067) | Sí |
| `Retry-After` | cabecera del `429` (RN-30) | Sí (declarado en el S2; implementación en US-234, S6) |

## Revisiones

- `clinical-language-auditor` (modo Diseño, 2026-10-24): FAIL con 0 bloqueantes, 3 mayores y 3 menores. **Todos aplicados** en esta versión: texto del criterio sin «elegida» y con el descargo, aviso de población con «según los datos registrados», `relevance.basis` alineado, prefijo de la línea de conteos, alcance del «sin evidencia» y `traceId` en US-062 AC-5.
