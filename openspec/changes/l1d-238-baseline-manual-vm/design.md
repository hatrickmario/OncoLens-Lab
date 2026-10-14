# Design — l1d-238-baseline-manual-vm

## Contexto

US-075 mide la **condición manual** de VM-1 y VM-2 con los oncólogos asesores en la semana 2 del S1, con el
protocolo de DEC-02 (decidida 2026-10-09) y las metas congeladas (R-15). Agenda confirmada `[S1 resp. 2]`;
supuestos "(asumido)" aceptados `[S1 resp. 3]`. El orquestador prepara casos y plantilla al inicio; el usuario
dirige y registra las sesiones. El software se limita a validar el registro y calcular medianas.

## Decisiones

- **D1 · Casos.** Seis casos en `data/evaluation/vm-baseline/<caso>/` (`mama-01…03`, `prostata-01…03`):
  `documentos/*.md`, `caso.json` (`tipo_cancer`, `pregunta_referencia`, `checklist_reconstruccion`, respuestas
  esperadas del checklist para que el moderador marque "reconstruido"). `mama-01` y `prostata-01` reutilizan el
  contenido clínico de los pacientes semilla (a) y (b) de OL-01 (US-039), con la misma pregunta de referencia que
  la demo del S1 (US-061). Los otros cuatro: valores ficticios fijos, sin nombres, documentos ni fechas
  absolutas (fechas relativas "mes 0", "mes 6"). Nota: el "generador sintético del seed" del Contexto técnico de
  US-075 es un seed de base de datos (Prisma), no un generador de documentos; se reutiliza su **contenido**, no
  su código.
- **D2 · Documentos en Markdown; PDF exportado para la sesión, no versionado** (Pendiente 4). Barato de revertir.
- **D3 · Comando en `apps/rag-orchestrator/app/evaluation/vm/`**, invocado como
  `python -m app.evaluation.vm baseline --csv eval/vm/baseline-S1.csv --manifest data/evaluation/vm-baseline/manifest.json --fecha <AAAA-MM-DD>`
  (alias `evaluate-vm baseline`). Python porque US-152 lo extiende en Python y comparte raíz con `evaluate`
  (US-072). Descartadas: script Node en `scripts/` (US-152 lo reescribiría) y paquete Python suelto en la raíz
  (otra cadena de herramientas).
- **D4 · Funciones puras con nombre propio**: `validar_fila_sesion()`, `medianas_por_tipo()`, `renderizar_reporte()`; E/S (lectura del CSV, del manifiesto y de DEC-02; escritura del
  reporte) solo en `__main__`. Mediana con `statistics.median`; formato decimal con coma, una cifra.
- **D5 · Configuración** (RN-22): `VM_SESSION_MAX_MINUTES` y `VM_PARTICIPANT_PATTERN` (`^O[1-9][0-9]*$`) en
  `eval/vm/baseline.json` (JSON, para leerlo solo con la biblioteca estándar).
- **D6b · CSV de columnas cerradas, sin fecha por sesión** (Gate 1, 2026-10-14). La cabecera del CSV MUST ser
  exactamente el conjunto declarado en `eval/vm/baseline-S1.template.csv`: `participante`, `caso`, `condicion`,
  `tiempo_reconstruccion_min`, `tiempo_evidencia_min`, `completado` (US-152 añadirá `cohorte`, opcional). Una
  columna no declarada —en particular notas libres, donde se cuela texto identificable— o la falta de una
  declarada hace fallar el comando antes de leer filas, nombrando la columna (nunca su contenido) y sin escribir
  el reporte. **No se registra la fecha de cada sesión** (sería un cuasi-identificador al cruzarla con la agenda
  de los oncólogos): la única fecha es la del reporte (`--fecha`). Las observaciones cualitativas, si las hay,
  quedan fuera del repo con la correspondencia nombre ↔ rol.
- **D6 · Determinismo**: fecha por `--fecha`; orden estable de filas (tipo, caso, participante); SHA-256 de DEC-02
  calculado sobre los bytes del archivo.

## Privacidad y ownership

- **Ningún dato cruza fronteras del sistema**: el comando no habla con `web`, `clinical-api` ni
  `rag-orchestrator` en ejecución, no abre red ni base de datos y no toca el schema `corpus`, Milvus, PostgreSQL
  clínico ni `clinical-minio`. Vivir dentro de `apps/rag-orchestrator` no le da acceso a datos clínicos: no
  importa `infrastructure/`.
- **Sin datos reales ni identificadores** (RN-13, RN-14): casos sintéticos con `clase: sintetico`; el CSV y el
  reporte solo llevan seudónimos `O<n>` (leyenda "Oncólogo asesor A/B"); la correspondencia nombre ↔ rol vive
  fuera del repo (DEC-02). Los mensajes de error nunca repiten el valor rechazado.
- `eval/vm/` queda cubierto por el escaneo de PII de la CI sin configuración adicional: L1D-166 escanea todo
  `git ls-files` (Gate 1); este change no añade exclusiones ni entradas de allowlist.
- No aplica desidentificación RN-11: no hay contexto hacia la IA.

## Contratos

Sin cambios en `apps/*/openapi.yaml` ni en `contracts/examples/`. El "contrato" del change es el formato del CSV
(`eval/vm/baseline-S1.template.csv`) y del manifiesto, documentados en `docs/evaluation/vm-baseline-protocolo.md`;
US-152 añade la columna `cohorte` sin romper el formato (columna opcional con valor por defecto `sintetico`).

## Dependencias y colaboradores

- Nuevo `app/evaluation/vm/`: `dominio.py` (validación y medianas, puro), `reporte.py` (render puro),
  `__main__.py` (CLI y E/S). Sin dependencias de puertos ni adapters; solo biblioteca estándar.
- Reglas extraídas: `validar_fila_sesion()` (seudónimo, caso, tiempos, condición), `medianas_por_tipo()`.
- Consumido por US-152 (`time`), US-153…US-155.

## Evaluación

OL-06 **no aplica**: no cambia modelo, prompt, umbral, catálogo ni corpus. Los casos de `vm-baseline/` no
alimentan ningún análisis ni la suite `evaluate`.

## Open Questions

- **Consentimiento de O1/O2 para publicar sus tiempos seudonimizados en un repo público** — dueño: **usuario**.
  Aunque el CSV y el reporte solo llevan `O<n>`, el equipo de asesores es pequeño y conocido; publicar sus tiempos
  en `eval/vm/` (repo público, RN-14) requiere su consentimiento explícito. Hasta resolverla, la tarea 3.4 no
  versiona `baseline-S1.csv` ni `baseline-S1.md`: se generan en local y el humano decide. Si no hay consentimiento,
  alternativa: versionar solo las medianas agregadas y dejar el CSV fuera del repo (como `VM_REAL_DATA_PATH` de
  US-152).

## Riesgos

- Agenda de los oncólogos (SUP-4): mitigada `[S1 resp. 2]`; si una sesión se cae, el reporte se publica con las
  filas registradas y se anota la falta; no se cambian metas.
- Sesgo de aprendizaje: en el S1 solo se mide la condición manual; el contrabalanceo de DEC-02 se aplica al
  medir con OncoLens (US-152), con casos distintos para la cohorte real.
