# DEC-11 — Criterios de aplicabilidad, excluyentes, «Parcial» y semántica de la lista de población

> Linear: [L1D-125](https://linear.app/l1der-lab-mjbc/issue/L1D-125) · Historia: US-021 (FEAT-08b) · Plantilla ligera para
> decisiones clínicas, legales o de producto. La parte técnica está en [ADR-47](../architecture/adr/ADR-47-extraccion-poblacion-en-abanico.md).

- **Estado:** decidida como escenario aceptado (firma pendiente)
- **Decide:** usuario (product owner) · **Valida / firma:** oncólogo asesor · **Fecha:** 2026-10-29
- **Requisitos:** FR-25, RN-27, RN-28, RN-29; TBD-13; AC-08.6

## Contexto

En el S3 los criterios se implementaron sobre el catálogo `propuesta_revisada` 1.1.0 `[S3 resp. 1]`:

- mama: HER2 (excluyente), receptores hormonales, estadio, línea, estado menopáusico y ECOG;
- próstata: estado de castración (excluyente), extensión, ISUP, línea, ECOG y HRR/BRCA.

El modelo admitía un solo valor del estudio por criterio. En la Demo 3 (2026-10-29) los oncólogos respondieron cómo tratar los estudios que describen varios valores ([`S3-demo-cierre.md`](../../backlog/sprints/S3-demo-cierre.md) §4, F-20…F-24). Con el ADR-47, la población del estudio pasa a ser una lista acotada por criterio y por fragmento, y hace falta fijar su semántica clínica.

## Decisión

Se aceptan F-20…F-24 como escenario más probable `[S4 resp. 8]`. US-243 se implementa sobre ellas y la firma formal llega en la sesión de oncólogos del S4. Si la sesión cambia algo, el cambio va al catálogo JSON o a la configuración, no al código.

Reglas (unidad = **fragmentos que sustentan la opción**, no el documento, F-22):

| Situación en la fuente | Estado visible (RN-28) | Detalle |
|---|---|---|
| Población específica y exclusiva del perfil del paciente | **Coincide** | — |
| Población inclusiva: el estudio incluyó varios grupos y el paciente pertenece a uno (p. ej., pre y posmenopáusicas) | **Parcial** | Motivo interno: inclusiva (F-20) |
| El fragmento mezcla poblaciones sin desagregarlas | **Parcial** | Motivo interno: mezclada; nunca exacto (F-22) |
| Restricción explícita que el paciente no cumple (p. ej., «solo posmenopáusicas») | **No coincide** | Solo con restricción explícita (F-21) |
| El valor del paciente no está en la lista y el estudio no declara restricción | **Desconocido** | `no_reportado_por_fuente` (F-21) |
| Valores en conflicto sobre la misma cohorte | **Desconocido** | `valores_en_conflicto`; se muestran ambos valores con sus citas y «requiere validación clínica/patológica» (F-23, `[S4 resp. 9]`) |
| Valores con alcance de subgrupo o mención | No cuentan para el estado | Se muestran como contexto |
| Presentación | — | Hasta 3 valores por criterio con su cita y «ver más» (F-24) |

Se mantienen los excluyentes del S3 (HER2 en mama, estado de castración en próstata) y la ausencia de cualquier puntaje o ponderación clínica (RN-28, AC-2 de US-021).

## Alternativas descartadas

- «Cumple alguno → Coincide»: era la propuesta inicial del insumo del S4. La sustituye F-20, porque da un falso Coincide con poblaciones inclusivas.
- Un quinto estado visible «Indeterminado» para los conflictos: cambiaría RN-28. Se proyecta sobre Desconocido con su motivo.
- Conflicto → Parcial: se leería como una coincidencia a medias que no existe.

## Desbloquea

- US-243 (dominio de estados con listas), US-126 (tabla con varios valores), US-134 (orden por aplicabilidad), US-247 (datos de demo con Coincide, Parcial y No coincide), US-233b (conjunto dorado por criterio).

## Validación pendiente

Firma del oncólogo asesor en la sesión del S4: la versión del catálogo debe llevar `validation` con alcance «aplicabilidad», firma y fecha (AC-1 de US-021). Sin firma, US-021 no pasa a Done. Las historias que dependen de ella sí pueden cerrar sobre el escenario aceptado, como en el S3.
