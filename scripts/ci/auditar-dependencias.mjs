#!/usr/bin/env node
/**
 * Auditoría de dependencias (US-217, design.md D1-D2): interpreta la salida JSON de `npm audit` y de `pip-audit`,
 * descarta los avisos cubiertos por una excepción vigente de `security/audit-exceptions.json` y falla nombrando
 * paquete, versión instalada e identificador del aviso. La fecha de hoy se inyecta (`--hoy`); la lógica pura no lee
 * el reloj. Solo imprime nombres de paquetes y avisos públicos.
 * Uso: node scripts/ci/auditar-dependencias.mjs --npm <json> --pip <json> [--excepciones <json>] [--lockfile <json>] [--hoy AAAA-MM-DD]
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SEVERIDADES_BLOQUEANTES = ['high', 'critical'];
const CAMPOS_DE_EXCEPCION = ['id', 'paquete', 'motivo', 'mitigacion', 'revisarAntesDe'];
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** ¿La excepción tiene una fecha de revisión ya pasada respecto de `hoy`? (ambas AAAA-MM-DD, comparables como texto). */
export function excepcionVencida(excepcion, hoy) {
  return excepcion.revisarAntesDe < hoy;
}

/** Campos obligatorios ausentes o vacíos, y fecha mal formada, de una excepción. */
function defectosDeExcepcion(excepcion) {
  const ausentes = CAMPOS_DE_EXCEPCION.filter((campo) => typeof excepcion?.[campo] !== 'string' || excepcion[campo].trim() === '');
  const defectos = ausentes.map((campo) => `falta el campo ${campo}`);
  if (!ausentes.includes('revisarAntesDe') && !FECHA_ISO.test(excepcion.revisarAntesDe)) {
    defectos.push('revisarAntesDe no es una fecha AAAA-MM-DD');
  }
  return defectos;
}

/** Avisos de `npm audit --json` (v2) de severidad alta o crítica; los paquetes que solo heredan (`via` de texto) no cuentan aparte. */
function avisosDeNpm(npmJson, versionesNpm) {
  if (!npmJson?.vulnerabilities) throw new Error('la salida de npm audit no tiene "vulnerabilities" (¿falló la auditoría?)');
  return Object.values(npmJson.vulnerabilities).flatMap((vulnerabilidad) =>
    vulnerabilidad.via
      .filter((via) => typeof via === 'object' && SEVERIDADES_BLOQUEANTES.includes(via.severity))
      .map((via) => ({
        ecosistema: 'npm',
        paquete: via.name ?? vulnerabilidad.name,
        version: versionesNpm[vulnerabilidad.nodes?.[0]] ?? 'desconocida',
        id: via.url?.split('/').pop() ?? String(via.source),
        alias: [],
      })),
  );
}

/** Todo aviso de `pip-audit -f json` bloquea: no da severidad (design.md D1, criterio conservador). */
function avisosDePip(pipJson) {
  if (!Array.isArray(pipJson?.dependencies)) throw new Error('la salida de pip-audit no tiene "dependencies"');
  return pipJson.dependencies.flatMap((dependencia) =>
    (dependencia.vulns ?? []).map((aviso) => ({
      ecosistema: 'pip',
      paquete: dependencia.name,
      version: dependencia.version,
      id: aviso.id,
      alias: aviso.aliases ?? [],
    })),
  );
}

const cubre = (excepcion, aviso) =>
  excepcion.paquete === aviso.paquete && (excepcion.id === aviso.id || aviso.alias.includes(excepcion.id));

const sinDuplicados = (avisos) => [...new Map(avisos.map((a) => [`${a.ecosistema}|${a.paquete}|${a.id}`, a])).values()];

/**
 * Función pura. Devuelve `bloqueantes` (mensajes que hacen fallar el job) y `aplicadas` (excepciones vigentes que
 * dejaron pasar un aviso). Una excepción mal formada o vencida bloquea aunque no haya aviso que cubrir.
 */
export function hallazgosBloqueantes(npmJson, pipJson, excepciones, hoy, versionesNpm = {}) {
  const bloqueantes = [];
  const vigentes = [];
  for (const excepcion of excepciones) {
    const defectos = defectosDeExcepcion(excepcion);
    if (defectos.length > 0) {
      bloqueantes.push(`excepción ${excepcion?.id ?? '(sin id)'} inválida: ${defectos.join('; ')}`);
    } else if (excepcionVencida(excepcion, hoy)) {
      bloqueantes.push(`excepción ${excepcion.id} vencida el ${excepcion.revisarAntesDe} (paquete ${excepcion.paquete})`);
    } else {
      vigentes.push(excepcion);
    }
  }
  const aplicadas = [];
  for (const aviso of sinDuplicados([...avisosDeNpm(npmJson, versionesNpm), ...avisosDePip(pipJson)])) {
    const excepcion = vigentes.find((candidata) => cubre(candidata, aviso));
    if (excepcion) {
      aplicadas.push(`excepción ${excepcion.id} aplicada a ${aviso.paquete} ${aviso.version} (revisar antes de ${excepcion.revisarAntesDe})`);
    } else {
      bloqueantes.push(`${aviso.ecosistema}: ${aviso.paquete} ${aviso.version} — aviso ${aviso.id}`);
    }
  }
  return { bloqueantes, aplicadas };
}

/** Versión instalada de cada ruta `node_modules/...` del lockfile. */
function versionesDelLockfile(ruta) {
  const paquetes = JSON.parse(readFileSync(ruta, 'utf8')).packages ?? {};
  return Object.fromEntries(Object.entries(paquetes).map(([nodo, datos]) => [nodo, datos.version]));
}

function parametros(argv) {
  const valores = {};
  for (let i = 0; i < argv.length; i += 2) valores[argv[i].replace(/^--/, '')] = argv[i + 1];
  return valores;
}

function main(argv) {
  const { npm, pip, excepciones = 'security/audit-exceptions.json', lockfile = 'package-lock.json', hoy } = parametros(argv);
  const fecha = hoy ?? new Date().toISOString().slice(0, 10);
  if (!npm || !pip || !FECHA_ISO.test(fecha)) {
    console.error('uso: auditar-dependencias.mjs --npm <json> --pip <json> [--excepciones <json>] [--lockfile <json>] [--hoy AAAA-MM-DD]');
    return 2;
  }
  try {
    const lista = JSON.parse(readFileSync(excepciones, 'utf8')).excepciones ?? [];
    const resultado = hallazgosBloqueantes(
      JSON.parse(readFileSync(npm, 'utf8')),
      JSON.parse(readFileSync(pip, 'utf8')),
      lista,
      fecha,
      versionesDelLockfile(lockfile),
    );
    resultado.aplicadas.forEach((linea) => console.log(`auditoría — ${linea}`));
    resultado.bloqueantes.forEach((linea) => console.error(`auditoría — ${linea}`));
    if (resultado.bloqueantes.length === 0) console.log('auditoría — sin avisos bloqueantes');
    return resultado.bloqueantes.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`auditoría — ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
