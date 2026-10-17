# Protocolo del baseline manual de VM-1 y VM-2 (US-075)

> Linear: L1D-238 · Historia: US-075 · Protocolo y metas: [DEC-02](../decisions/DEC-02-protocolo-vm.md) ·
> Decisiones del S1: `[S1 resp. 26]` (protocolo) y `[S1 resp. 27]` (dos desenlaces de VM-2).
> **Metas no modificadas; criterio de éxito enmendado en DEC-02 `[S1 resp. 27]`** (R-15).

Este documento es el guion que sigue el moderador (el usuario, PO) en cada sesión. Mide la **condición manual**,
sin OncoLens, de VM-1 (tiempo para reconstruir el caso) y VM-2 (tiempo hasta encontrar evidencia aplicable) sobre la
cohorte **sintética**. Los casos están en `data/evaluation/vm-baseline/`; el registro, en `eval/vm/`.

## Reglas de privacidad

- Casos **sintéticos** (`clase: sintetico`); ningún dato real ni paciente real (RN-13, RN-14).
- Participantes con seudónimo `O<n>`: `O1 = Oncólogo asesor A`, `O2 = Oncólogo asesor B`. La correspondencia
  nombre ↔ rol se guarda **fuera del repositorio**, que es público.
- El CSV no lleva nombres, fecha por sesión ni texto libre. La **justificación breve de VM-2** y cualquier
  observación cualitativa se anotan fuera del repo.

## Antes de medir (tareas humanas)

1. Los oncólogos validan por **coherencia longitudinal** (diagnóstico, TNM o estadio a la fecha, biomarcadores,
   intención terapéutica, secuencia previa y línea actual, con una única interpretación razonable) los cuatro casos
   ficticios (`mama-02`, `mama-03`, `prostata-02`, `prostata-03`), y revisan los críticos y complementarios y la
   pregunta de referencia de cada caso. Los casos siguen siendo sintéticos y las metas no cambian.
2. El usuario registra en `manifest.json` la `version` y la `fecha_validacion_clinica` (AAAA-MM-DD) de cada
   `checklist_reconstruccion`. Mientras falten, el comando se niega a producir el reporte.
3. Exportar a PDF los documentos de cada caso (Markdown en `<caso>/documentos/`); el PDF no se versiona.

## Guion de sesión (por participante y por caso)

Condición única: **manual**. El participante dispone de los PDF del caso y de su herramienta habitual.

**Tarea VM-1 · reconstruir el caso**
1. Entregar los PDF. Iniciar el cronómetro.
2. El participante responde el `checklist_reconstruccion`. "Reconstruido" exige **todos los elementos críticos**
   (diagnóstico, estadio a la fecha, biomarcadores, intención terapéutica, secuencia previa y línea actual) con la
   `respuesta_esperada` del manifiesto; una reconstrucción parcialmente correcta no cuenta. Los complementarios se
   anotan, pero no cambian el desenlace.
3. Detener el cronómetro al completar los críticos o a los **30 minutos** (`VM_SESSION_MAX_MINUTES`). Si llega a 30
   sin completar, registrar `tiempo_reconstruccion_min = 30` y `reconstruido = no` ("no completada").

**Tarea VM-2 · encontrar evidencia aplicable** (cronometrada **por separado** de VM-1)
1. Leer la `pregunta_referencia.texto` del caso (incluye la fecha de corte de la evidencia). Iniciar el cronómetro.
2. Herramientas permitidas: buscadores públicos y fuentes abiertas; **sin NCCN ni ESMO**, para igualar el corpus.
3. Detener al señalar ≥ 1 fuente que el participante juzga aplicable (con una justificación breve, fuera del repo) o
   a los **30 minutos**. Registrar `autoidentificada` (`si`/`no`) y, si es `si`, el `fuente_id` (PMID, DOI o id de
   catálogo; sin espacios ni texto libre). Si llega a 30 sin fuente: `tiempo_evidencia_min = 30`,
   `autoidentificada = no`, `fuente_id` vacío.

## Validación ciega de VM-2 `[S1 resp. 27]`

1. Con todas las sesiones registradas, generar los pares:
   `python -m app.evaluation.vm pares-validacion --csv eval/vm/baseline-S1.csv --manifest data/evaluation/vm-baseline/manifest.json`
   (salida por defecto `eval/vm/pares-validacion-S1.csv`).
2. Entregar al evaluador **solo** los pares (`caso`, pregunta, `fuente_id`), únicos y ordenados; sin tiempos ni
   participantes.
3. El evaluador decide si la fuente corresponde al caso y a la pregunta con evidencia publicada hasta la fecha de
   corte. El usuario traslada el veredicto a la columna `validada` (`si`/`no`) de **todas** las filas del par.
   Una fila con `autoidentificada = no` lleva `validada = no`. `validada` vacío = validación pendiente: no hay reporte.

La meta de DEC-02 (−50 % de la mediana) se calcula sobre la mediana **validada** de VM-2; la autoidentificada se
informa al lado.

## Formato del CSV `eval/vm/baseline-S1.csv`

Una fila por caso y participante. La cabecera es el **conjunto cerrado** de `eval/vm/baseline-S1.template.csv`;
cualquier columna adicional (notas, justificación, `fecha_sesion`) hace fallar el comando.

| Columna | Valores |
|---|---|
| `participante` | seudónimo `O<n>` (`VM_PARTICIPANT_PATTERN`) |
| `caso` | id del manifiesto |
| `condicion` | `manual` |
| `tiempo_reconstruccion_min` | 0 < t ≤ 30 (`VM_SESSION_MAX_MINUTES`) |
| `reconstruido` | `si`/`no`; `t = 30` implica `no` |
| `tiempo_evidencia_min` | 0 < t ≤ 30 |
| `autoidentificada` | `si`/`no` |
| `fuente_id` | vacío si `autoidentificada = no`; si no, `VM_SOURCE_ID_PATTERN` |
| `validada` | `si`/`no`; `si` exige `autoidentificada = si` y `fuente_id`; mismo par caso–fuente, mismo veredicto |

Configuración en `eval/vm/baseline.json` (RN-22).

## Formato del manifiesto `data/evaluation/vm-baseline/manifest.json`

`clase: sintetico` y `casos[]` (≥ 3 de mama, ≥ 3 de próstata). Cada caso: `id`, `tipo_cancer`, `documentos[]`
(rutas relativas al manifiesto), `pregunta_referencia` (`poblacion`, `contexto_clinico`, `decision`,
`fecha_corte_evidencia`, `texto` con la fecha de corte; **propia del baseline, no la de la demo** `Q-HER2`) y
`checklist_reconstruccion` (`version`, `fecha_validacion_clinica`, `criticos[]` con `eje` y `respuesta_esperada`
—los seis ejes— y `complementarios[]`).

## Cálculo y reporte

```bash
cd apps/rag-orchestrator
python -m app.evaluation.vm baseline --fecha <AAAA-MM-DD> \
  --csv ../../eval/vm/baseline-S1.csv \
  --manifest ../../data/evaluation/vm-baseline/manifest.json \
  --out ../../eval/vm/baseline-S1.md
```

Ejecutarlo dos veces con la misma fecha y comparar: los reportes son idénticos byte a byte. Versionar
`eval/vm/baseline-S1.md` con fecha anterior a `/sprint-close` del S1 (consentimiento de O1/O2 dado,
`[S1 resp. 23]`). La cohorte real se mide después de G-Piloto (US-152).
