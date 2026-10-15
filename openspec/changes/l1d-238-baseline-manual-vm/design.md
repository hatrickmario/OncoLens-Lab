# Design — l1d-238-baseline-manual-vm

## Contexto

US-075 mide la **condición manual** de VM-1 y VM-2 con los oncólogos asesores en la semana 2 del S1, con el
protocolo de DEC-02 (decidida 2026-10-09) y las metas congeladas (R-15). Agenda confirmada `[S1 resp. 2]`;
supuestos "(asumido)" aceptados `[S1 resp. 3]`. El orquestador prepara casos y plantilla al inicio; el usuario
dirige y registra las sesiones. El software se limita a validar el manifiesto y el registro y a calcular
medianas. La validación clínica de los oncólogos asesores (`backlog/sprints/S1-plan.md` §7, `[S1 resp. 26]` y
`[S1 resp. 27]`, 2026-10-14) fija el protocolo: tiempo máximo por tarea, estructura del checklist y de la pregunta
de referencia, y dos desenlaces de VM-2.

## Decisiones

- **D1 · Casos.** Seis casos en `data/evaluation/vm-baseline/<caso>/` (`mama-01…03`, `prostata-01…03`):
  `documentos/*.md` y `caso.json` (`tipo_cancer`, `pregunta_referencia`, `checklist_reconstruccion` con las
  respuestas esperadas de cada elemento para que el moderador marque "reconstruido"). `mama-01` y `prostata-01`
  reutilizan el contenido clínico de los pacientes semilla (a) y (b) de OL-01 (US-039). Los otros cuatro: valores
  ficticios fijos, sin nombres, documentos ni fechas absolutas (fechas relativas "mes 0", "mes 6"), validados
  clínicamente por **coherencia longitudinal** —diagnóstico, TNM o estadio a la fecha, biomarcadores, intención
  terapéutica, secuencia previa y línea actual— con una única interpretación razonable; siguen siendo sintéticos
  `[S1 resp. 26]` (A2). Nota: el "generador sintético del seed" del Contexto técnico de US-075 es un seed de base
  de datos (Prisma), no un generador de documentos; se reutiliza su **contenido**, no su código.
  **Corrección `[S1 resp. 26]` (A4):** la versión anterior decía que `mama-01` y `prostata-01` usaban "la misma
  pregunta de referencia que la demo del S1"; ya no. La pregunta de referencia es propia del baseline y la de la
  demo (`Q-HER2`, US-061) no cambia.
- **D1a · Checklist con críticos y complementarios** `[S1 resp. 26]` (A3). `checklist_reconstruccion` =
  `{version, fecha_validacion_clinica, criticos[], complementarios[]}`, cada elemento con `eje` (en `criticos`, los
  seis de A2: `diagnostico`, `estadio_a_la_fecha`, `biomarcadores`, `intencion_terapeutica`, `secuencia_previa`,
  `linea_actual`) y `respuesta_esperada`. "Reconstruido" = todos los críticos recuperados dentro del tiempo
  máximo; los complementarios se anotan en la sesión pero no cambian el desenlace ni se versionan por intento. El
  comando valida el manifiesto **antes** del CSV: falta de un eje crítico, de `version` o de
  `fecha_validacion_clinica` (AAAA-MM-DD) ⇒ código ≠ 0 nombrando caso y regla.
- **D1b · Pregunta de referencia estructurada** `[S1 resp. 26]` (A4). `pregunta_referencia` =
  `{poblacion, contexto_clinico, decision, fecha_corte_evidencia, texto}`; `texto` contiene la fecha de corte.
  Ejemplo para `mama-01`: "En una paciente con cáncer de mama HER2 positivo, estadio IIA, tras cirugía con
  intención curativa, ¿qué opciones adyuvantes están respaldadas por evidencia publicada hasta [fecha de corte]?".
- **D2 · Documentos en Markdown; PDF exportado para la sesión, no versionado** (Pendiente 4). Barato de revertir.
- **D3 · Comando en `apps/rag-orchestrator/app/evaluation/vm/`**, invocado como
  `python -m app.evaluation.vm baseline --csv eval/vm/baseline-S1.csv --manifest data/evaluation/vm-baseline/manifest.json --fecha <AAAA-MM-DD>`
  (alias `evaluate-vm baseline`), y `python -m app.evaluation.vm pares-validacion --csv … --manifest … --out …`
  (D7). Python porque US-152 lo extiende en Python y comparte raíz con `evaluate` (US-072). Descartadas: script
  Node en `scripts/` (US-152 lo reescribiría) y paquete Python suelto en la raíz (otra cadena de herramientas).
- **D4 · Funciones puras con nombre propio**: `validar_manifiesto()`, `validar_fila_sesion()`,
  `validar_coherencia_validacion()`, `pares_para_validacion()`, `medianas_por_tipo()`, `renderizar_reporte()`; E/S
  (lectura del CSV, del manifiesto y de DEC-02; escritura del reporte y de los pares) solo en `__main__`. Mediana
  con `statistics.median`; formato decimal con coma, una cifra.
- **D5 · Configuración** (RN-22) en `eval/vm/baseline.json` (JSON, para leerlo solo con la biblioteca estándar):
  `VM_SESSION_MAX_MINUTES = 30` **por tarea** `[S1 resp. 26]` (A1), `VM_PARTICIPANT_PATTERN` (`^O[1-9][0-9]*$`) y
  `VM_SOURCE_ID_PATTERN` (`^[A-Za-z0-9._:/-]{1,128}$`: PMID, DOI o id del catálogo; sin espacios, así no cabe
  texto libre).
- **D6b · CSV de columnas cerradas, sin fecha por sesión ni texto libre** (Gate 1, 2026-10-14; ampliado
  `[S1 resp. 26]` y `[S1 resp. 27]`). La cabecera MUST ser exactamente el conjunto declarado en
  `eval/vm/baseline-S1.template.csv`:

  | Columna | Valores | Origen |
  |---|---|---|
  | `participante` | `O<n>` | Gate 1 |
  | `caso` | id del manifiesto | Gate 1 |
  | `condicion` | `manual` | Gate 1 |
  | `tiempo_reconstruccion_min` | 0 < t ≤ 30 | A1 |
  | `reconstruido` | `si` / `no` (sustituye a `completado` para VM-1) | A1, A3 |
  | `tiempo_evidencia_min` | 0 < t ≤ 30 | A1 |
  | `autoidentificada` | `si` / `no` | A5 |
  | `fuente_id` | vacío si `autoidentificada = no`; si no, cumple `VM_SOURCE_ID_PATTERN` | A5 |
  | `validada` | `si` / `no`; vacío = validación pendiente ⇒ no hay reporte | A5 |

  US-152 añadirá `cohorte`, opcional. Una columna no declarada —en particular notas libres o la justificación de
  VM-2, donde se cuela texto identificable— o la falta de una declarada hace fallar el comando antes de leer filas,
  nombrando la columna (nunca su contenido) y sin escribir el reporte. **No se registra la fecha de cada sesión**
  (cuasi-identificador al cruzarla con la agenda): la única fecha es la del reporte (`--fecha`). La justificación
  breve de VM-2 y las observaciones cualitativas, si se anotan, quedan fuera del repo con la correspondencia
  nombre ↔ rol `[S1 resp. 27]`.
- **D6c · Tiempo máximo por tarea** `[S1 resp. 26]` (A1). VM-1 y VM-2 se cronometran por separado; cada una para a
  los 30 min. Una tarea que alcanza el máximo se registra con `t = 30` y desenlace `no`; `t > 30` o `t = 30` con
  desenlace `si` se rechazan. Una tarea no completada entra en la mediana con el máximo (censura a la derecha) y se
  lista en "tareas no completadas".
- **D6d · Dos desenlaces de VM-2** `[S1 resp. 27]` (A5). `autoidentificada = si` cuando el participante señala ≥ 1
  fuente con justificación breve; `validada` lo decide después un evaluador sobre el par (caso, fuente). Reglas:
  `validada = si` ⇒ `autoidentificada = si` y `fuente_id` no vacío; mismo par (`caso`, `fuente_id`) ⇒ mismo
  `validada` en todas las filas. El reporte trae **dos medianas** de VM-2: la autoidentificada (completado si
  `autoidentificada = si`) y la validada (completado solo si `validada = si`; si no, cuenta con el tiempo
  máximo). La meta de DEC-02 (−50 % de la mediana) se calcula sobre la validada; el valor de la meta no cambia y
  el reporte dice "metas no modificadas; criterio de éxito enmendado en DEC-02 [S1 resp. 27]". La enmienda del
  texto de DEC-02 queda fuera de este change; el reporte guarda la huella SHA-256 de la versión que lee.
- **D7 · Validación ciega** `[S1 resp. 27]`. `pares-validacion` escribe `eval/vm/pares-validacion-S1.csv` con
  (`caso`, `pregunta_referencia.texto`, `fuente_id`) **únicos y ordenados** por caso y fuente: sin tiempos,
  participantes, desenlaces ni orden de registro, de modo que el evaluador no puede atribuir un par a un intento.
  El evaluador (oncólogo asesor o evaluador clínico designado por el usuario) decide si la fuente corresponde al
  caso y a la pregunta con evidencia publicada hasta la fecha de corte, y el usuario traslada el veredicto a la
  columna `validada` de todas las filas del par. Es una tarea **[humano]**. Descartada: guardar los veredictos en
  un segundo CSV unido por el comando (más superficie para el mismo resultado).
- **D6 · Determinismo**: fecha por `--fecha`; orden estable de filas (tipo, caso, participante) y de pares (caso,
  fuente); SHA-256 de DEC-02 calculado sobre los bytes del archivo.

## Privacidad y ownership

- **Ningún dato cruza fronteras del sistema**: el comando no habla con `web`, `clinical-api` ni
  `rag-orchestrator` en ejecución, no abre red ni base de datos y no toca el schema `corpus`, Milvus, PostgreSQL
  clínico ni `clinical-minio`. Vivir dentro de `apps/rag-orchestrator` no le da acceso a datos clínicos: no
  importa `infrastructure/`.
- **Sin datos reales ni identificadores** (RN-13, RN-14): casos sintéticos con `clase: sintetico`, también tras la
  validación clínica (A2); el CSV, los pares y el reporte solo llevan seudónimos `O<n>` (leyenda "Oncólogo asesor
  A/B") e ids de fuentes públicas; ni la justificación de VM-2 ni notas libres entran al repo; la correspondencia
  nombre ↔ rol vive fuera del repo (DEC-02). Los mensajes de error nunca repiten el valor rechazado.
- La lista de pares no lleva participante ni tiempo: protege la ceguera del evaluador y no añade datos personales.
- `eval/vm/` queda cubierto por el escaneo de PII de la CI sin configuración adicional: L1D-166 escanea todo
  `git ls-files` (Gate 1); este change no añade exclusiones ni entradas de allowlist.
- No aplica desidentificación RN-11: no hay contexto hacia la IA.

## Contratos

Sin cambios en `apps/*/openapi.yaml` ni en `contracts/examples/`. El "contrato" del change es el formato del CSV
(`eval/vm/baseline-S1.template.csv`), del manifiesto (checklist y pregunta de referencia, D1a–D1b) y de la lista
de pares, documentados en `docs/evaluation/vm-baseline-protocolo.md`; US-152 añade la columna `cohorte` sin romper
el formato (columna opcional con valor por defecto `sintetico`).

## Dependencias y colaboradores

- Nuevo `app/evaluation/vm/`: `dominio.py` (validación de manifiesto y filas, coherencia de la validación, pares,
  medianas; puro), `reporte.py` (render puro), `__main__.py` (CLI y E/S). Sin dependencias de puertos ni adapters;
  solo biblioteca estándar.
- Reglas extraídas: `validar_manifiesto()` (A3–A4), `validar_fila_sesion()` (seudónimo, caso, tiempos ≤ máximo,
  condición, desenlaces), `validar_coherencia_validacion()` (A5), `pares_para_validacion()` (D7),
  `medianas_por_tipo()` (VM-1 y las dos de VM-2).
- Fuera del change: la enmienda de DEC-02 `[S1 resp. 27]`.
- Consumido por US-152 (`time`), US-153…US-155.

## Evaluación

OL-06 **no aplica**: no cambia modelo, prompt, umbral, catálogo ni corpus. Los casos de `vm-baseline/` no
alimentan ningún análisis ni la suite `evaluate`.

## Open Questions

- ~~Consentimiento de O1/O2 para publicar sus tiempos seudonimizados~~ **Resuelta (usuario, 2026-10-14, `[S1 resp. 23]`):** hay consentimiento, así que `baseline-S1.csv` y `baseline-S1.md` se versionan con los seudónimos `O<n>`.
- El checklist de "caso reconstruido" y las herramientas de la condición manual de DEC-02 están **aprobados por los oncólogos** `[S1 resp. 24]`.
- ~~`VM_SESSION_MAX_MINUTES`, plausibilidad de los casos, checklist, preguntas de referencia y criterio de "evidencia aplicable"~~ **Resueltas (oncólogos asesores, 2026-10-14, `[S1 resp. 26]` y `[S1 resp. 27]`):** 30 min por tarea; validación por coherencia longitudinal; críticos/complementarios con versión y fecha; pregunta con población, contexto, decisión y fecha de corte; dos desenlaces de VM-2 con validación ciega. Queda la **ejecución** de la validación clínica de los 4 casos y de la validación ciega (tareas [humano]).

## Riesgos

- Agenda de los oncólogos (SUP-4): mitigada `[S1 resp. 2]`; si una sesión se cae, el reporte se publica con las
  filas registradas y se anota la falta; no se cambian metas.
- Sesgo de aprendizaje: en el S1 solo se mide la condición manual; el contrabalanceo de DEC-02 se aplica al
  medir con OncoLens (US-152), con casos distintos para la cohorte real.
- Evaluador no disponible a tiempo: sin `validada` no hay reporte; la validación ciega se agenda con las sesiones.
  Un evaluador que también participó puede reconocer sus fuentes; preferir uno que no valide sus propios casos
  si hay dos oncólogos (el ciego al tiempo y al participante se mantiene por la lista de pares).
