import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const WEB = path.join(RAIZ, 'apps/web');
const EXTENSIONES = ['', '.ts', '.tsx', '.json', '/index.ts'];

/** Orígenes de los `COPY` de la etapa build del Dockerfile de web, relativos a la raíz del repo. */
function origenesCopiados() {
  const etapaBuild = readFileSync(path.join(WEB, 'Dockerfile'), 'utf8').split(
    /^FROM .* AS runtime/m,
  )[0];
  return etapaBuild
    .split('\n')
    .filter((linea) => /^COPY (?!--from)/.test(linea))
    .map((linea) => linea.split(/\s+/)[1].replace(/\/$/, ''));
}

function fuentes(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });
}

/** Archivo real al que apunta un import relativo (`.js` de NodeNext incluido), o null si no es de ejecución local. */
function resolverImport(desde, especificador) {
  const base = path.resolve(path.dirname(desde), especificador.replace(/\.js$/, ''));
  const real = EXTENSIONES.map((ext) => base + ext).find(
    (c) => existsSync(c) && statSync(c).isFile(),
  );
  return real ?? null;
}

function importsRelativos(archivo) {
  const fuente = readFileSync(archivo, 'utf8');
  return [...fuente.matchAll(/^(?:import|export)\s[^;]*?from\s+'(\.[^']+)'/gms)].map((m) => m[1]);
}

/** Todo archivo de packages/ que entra al build de web: imports directos y sus relativos transitivos. */
function archivosDePackagesUsadosPorWeb() {
  const pendientes = ['app', 'components', 'lib'].flatMap((d) => fuentes(path.join(WEB, d)));
  const vistos = new Set();
  while (pendientes.length > 0) {
    const archivo = pendientes.pop();
    for (const especificador of importsRelativos(archivo)) {
      const destino = resolverImport(archivo, especificador);
      if (!destino || vistos.has(destino)) continue;
      const relativo = path.relative(RAIZ, destino);
      if (!relativo.startsWith('packages/')) continue;
      vistos.add(destino);
      if (/\.tsx?$/.test(destino)) pendientes.push(destino);
    }
  }
  return [...vistos].map((a) => path.relative(RAIZ, a)).sort();
}

describe('apps/web/Dockerfile · etapa build', () => {
  it('copia cada archivo de packages/ que importa apps/web, directa o transitivamente [US-246 AC-1]', () => {
    const origenes = origenesCopiados();
    const sinCopiar = archivosDePackagesUsadosPorWeb().filter(
      (archivo) => !origenes.some((o) => archivo === o || archivo.startsWith(`${o}/`)),
    );
    expect(sinCopiar).toEqual([]);
  });

  it('no copia a la imagen más de packages/ que lo que web importa del verificador RN-23 [US-246 AC-1]', () => {
    const origenes = origenesCopiados().filter((o) => o.startsWith('packages/clinical-'));
    expect(origenes.sort()).toEqual([
      'packages/clinical-catalogs/lenguaje/terminos-prohibidos.json',
      'packages/clinical-language/src',
    ]);
  });
});
