import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const lineas = readFileSync(path.join(RAIZ, '.dockerignore'), 'utf8')
  .split('\n')
  .map((linea) => linea.trim())
  .filter((linea) => linea !== '' && !linea.startsWith('#'));

describe('.dockerignore', () => {
  it.each([
    'infra/docker/secrets/',
    '**/secrets/',
    '**/*.pem',
    '**/*.key',
    '**/pg_hba*.conf',
    '**/.env',
    '**/.env.*',
  ])('excluye %s del contexto de construcción para que ningún secreto llegue a una capa de imagen [US-035 AC-1]', (patron) => {
    expect(lineas).toContain(patron);
  });

  it.each(['apps/web/tests', 'apps/web/vitest*.config.ts'])(
    'excluye %s de la imagen de web: los tests importan scripts/ que el contexto no incluye [US-060 AC-5]',
    (patron) => {
      expect(lineas).toContain(patron);
    },
  );

  it('conserva .env.example como única excepción de las variables de entorno [US-035 AC-1]', () => {
    expect(lineas).toContain('!**/.env.example');
    expect(lineas.filter((linea) => linea.startsWith('!'))).toEqual(['!**/.env.example']);
  });
});

// BuildKit usa <Dockerfile>.dockerignore EN LUGAR del .dockerignore de la raíz: cada uno debe repetir todos los patrones
// de la raíz o esa imagen vuelve a recibir secretos y datos en el contexto [US-035 AC-1, RN-14].
const ESPECIFICOS = readdirSync(RAIZ, { recursive: true })
  .map(String)
  .filter((ruta) => ruta.endsWith('.dockerignore') && ruta !== '.dockerignore')
  .filter((ruta) => !/(^|\/)(node_modules|\.git|\.claude)(\/|$)/.test(ruta));

describe('**/*.dockerignore específicos', () => {
  it('hay al menos uno (el de la imagen de rag-orchestrator)', () => {
    expect(ESPECIFICOS).toContain('apps/rag-orchestrator/Dockerfile.dockerignore');
  });

  it.each(ESPECIFICOS)('%s repite todos los patrones del .dockerignore raíz', (ruta) => {
    const propios = readFileSync(path.join(RAIZ, ruta), 'utf8')
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea !== '' && !linea.startsWith('#'));
    expect(lineas.filter((patron) => !propios.includes(patron))).toEqual([]);
  });
});
