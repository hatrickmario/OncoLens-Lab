// Normaliza la salida de cada herramienta de calidad al hallazgo común (L1D-263, design D2):
// { tool, rule, file, line, symbol, measured, threshold, severity }. Funciones puras, sin E/S.
import path from 'node:path';
import { excepcionesVigentes } from './umbrales.mjs';

export const hallazgo = (campos) => ({
  tool: null,
  rule: null,
  file: null,
  line: null,
  symbol: null,
  measured: null,
  threshold: null,
  severity: 'error',
  ...campos,
});

const relativa = (raiz, archivo) => path.relative(raiz, archivo).split(path.sep).join('/');

/** "Function 'f' has too many lines (41). Maximum allowed is 40." → símbolo, valor medido y umbral. */
function leerMedidaDeEslint(mensaje) {
  const simbolo = /^(?:Async |Generator )?(?:function|method|arrow function)(?: '([^']+)')?/i.exec(
    mensaje,
  );
  const medido = /\((\d+)\)|complexity of (\d+)/.exec(mensaje);
  const umbral = /Maximum allowed is (\d+)/.exec(mensaje);
  return {
    symbol: simbolo?.[1] ?? null,
    measured: medido ? Number(medido[1] ?? medido[2]) : null,
    threshold: umbral ? Number(umbral[1]) : null,
  };
}

/** Resultados de la API de ESLint (`lintFiles`): errores y advertencias de todas las reglas. */
export function desdeEslint(resultados, raiz) {
  return resultados.flatMap((resultado) =>
    resultado.messages.map((mensaje) =>
      hallazgo({
        tool: 'eslint',
        rule: mensaje.ruleId ?? 'eslint',
        file: relativa(raiz, resultado.filePath),
        line: mensaje.line ?? null,
        severity: mensaje.severity === 2 ? 'error' : 'warn',
        ...leerMedidaDeEslint(mensaje.message),
      }),
    ),
  );
}

/** JSON de `depcruise --output-type json`: una violación por dependencia (o ciclo) prohibida. */
export function desdeDependencyCruiser(informe) {
  return informe.summary.violations.map((violacion) =>
    hallazgo({
      tool: 'dependency-cruiser',
      rule: violacion.rule.name,
      file: violacion.from,
      symbol: violacion.cycle?.length
        ? [violacion.from, ...violacion.cycle.map((paso) => paso.name)].join(' → ')
        : violacion.to,
      severity: violacion.rule.severity === 'error' ? 'error' : 'warn',
    }),
  );
}

/** "`f` is too complex (11 > 10)" / "Too many statements (51 > 50)" → símbolo, valor medido y umbral. */
function leerMedidaDeRuff(mensaje) {
  const simbolo = /`([^`]+)`/.exec(mensaje);
  const medida = /\((\d+) > (\d+)\)/.exec(mensaje);
  return {
    symbol: simbolo?.[1] ?? null,
    measured: medida ? Number(medida[1]) : null,
    threshold: medida ? Number(medida[2]) : null,
  };
}

/** JSON de `ruff check --output-format json`. */
export function desdeRuff(diagnosticos, raiz) {
  return diagnosticos.map((diagnostico) =>
    hallazgo({
      tool: 'ruff',
      rule: diagnostico.code,
      file: relativa(raiz, diagnostico.filename),
      line: diagnostico.location.row,
      ...leerMedidaDeRuff(diagnostico.message),
    }),
  );
}

/** Texto de `lint-imports`: una violación por import prohibido de la sección "Broken contracts". */
export function desdeImportLinter(texto, directorio) {
  const rotos = texto.split(/-{3,}\s*\nBroken contracts\s*\n-{3,}/)[1];
  if (!rotos) return [];
  const hallazgos = [];
  let contrato = null;
  const lineas = rotos.split('\n');
  lineas.forEach((linea, indice) => {
    if (/^-{3,}$/.test(linea.trim()) && lineas[indice - 1]?.trim()) {
      contrato = lineas[indice - 1].trim();
      return;
    }
    const importacion = /^-\s+(\S+) -> (\S+?)(?: \(l\.(\d+)(?:, l\.\d+)*\))?\s*$/.exec(linea);
    if (importacion && contrato) {
      hallazgos.push(
        hallazgo({
          tool: 'import-linter',
          rule: contrato,
          file: `${directorio}/${importacion[1].replaceAll('.', '/')}.py`,
          line: importacion[3] ? Number(importacion[3]) : null,
          symbol: `${importacion[1]} -> ${importacion[2]}`,
        }),
      );
    }
  });
  return hallazgos;
}

/** Contratos de capas que `lint-imports` debe nombrar siempre (apps/rag-orchestrator/.importlinter). */
export const CONTRATOS_DE_IMPORT_LINTER = ['dominio-independiente', 'capas-hexagonales'];

/**
 * Interpreta la ejecución de `lint-imports`: estado 0 y los contratos exigidos en KEPT = sin hallazgos;
 * estado 1 con contratos rotos = hallazgos; cualquier otra cosa (configuración inválida, contratos ausentes,
 * estado 1 sin contrato roto) es una herramienta rota y lanza, nunca "0 hallazgos".
 */
export function evaluarImportLinter(estado, texto, directorio) {
  if (estado !== 0 && estado !== 1) {
    throw new Error(`import-linter terminó con estado ${estado}: ${texto.trim().slice(-300)}`);
  }
  const ausentes = CONTRATOS_DE_IMPORT_LINTER.filter(
    (contrato) => !new RegExp(`${contrato} (KEPT|BROKEN)`).test(texto),
  );
  if (ausentes.length > 0) {
    throw new Error(
      `import-linter no evaluó los contratos ${ausentes.join(', ')}: ${texto.trim().slice(-300)}`,
    );
  }
  const hallazgos = desdeImportLinter(texto, directorio);
  if (estado === 1 && hallazgos.length === 0) {
    throw new Error('import-linter terminó con estado 1 sin ningún contrato roto en su salida');
  }
  return hallazgos;
}

const REGLAS_DE_TAMANO = 'max-lines-per-function|complexity|max-lines';
// `eslint-disable` que nombra una regla de tamaño, o que desactiva todo (sin lista de reglas).
const DESACTIVA_TAMANO = new RegExp(
  `eslint-disable(?:-next-line|-line)?(?:\\s+[^\\n]*\\b(?:${REGLAS_DE_TAMANO})\\b|\\s*(?:\\*/|--|$))`,
);

/** Hallazgo por cada comentario `eslint-disable` que silencia tamaño o complejidad (o todo). */
export function buscarDesactivacionesDeTamano(archivos) {
  return archivos.flatMap(({ file, texto }) =>
    texto.split('\n').flatMap((linea, indice) =>
      DESACTIVA_TAMANO.test(linea)
        ? [
            hallazgo({
              tool: 'quality',
              rule: 'sin-eslint-disable-de-tamano',
              file,
              line: indice + 1,
              symbol: linea.trim(),
            }),
          ]
        : [],
    ),
  );
}

/** Descarta la alerta de tamaño de un archivo que ya falla por el límite duro (evita el doble reporte). */
export function sinAlertaDondeHayError(hallazgos) {
  const conError = new Set(
    hallazgos.filter((h) => h.rule === 'max-lines' && h.severity === 'error').map((h) => h.file),
  );
  return hallazgos.filter(
    (h) => !(h.rule === 'max-lines' && h.severity === 'warn' && conError.has(h.file)),
  );
}

/** Orden estable: el reporte es determinista entre ejecuciones. */
export function ordenar(hallazgos) {
  return [...hallazgos].sort(
    (a, b) =>
      a.tool.localeCompare(b.tool) ||
      a.rule.localeCompare(b.rule) ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}

/** Una línea legible por hallazgo: regla, archivo, símbolo, valor medido y umbral. */
export function describir(h) {
  const lugar = h.line ? `${h.file}:${h.line}` : h.file;
  const simbolo = h.symbol ? ` ${h.symbol}` : '';
  const medida = h.measured === null ? '' : ` medido ${h.measured}, umbral ${h.threshold}`;
  return `[${h.tool}] ${h.severity === 'error' ? 'ERROR' : 'ALERTA'} ${h.rule} ${lugar}${simbolo}${medida}`;
}

/** Reporte de `reports/quality/latest.json`; `ahora` y `commit` se inyectan para que sea reproducible en tests. */
export function armarReporte(umbrales, hallazgos, { ahora, commit, cobertura = null }) {
  const errores = hallazgos.filter((h) => h.severity === 'error').length;
  return {
    generadoEn: ahora.toISOString(),
    commit,
    umbrales: { ...umbrales, excepciones: undefined },
    excepcionesVigentes: excepcionesVigentes(umbrales.excepciones, ahora),
    resumen: { errores, alertas: hallazgos.length - errores },
    // Porcentaje de líneas cambiadas cubiertas por archivo (US-213 AC-11); null = sin informes de cobertura o sin rama base.
    cobertura,
    hallazgos,
  };
}
