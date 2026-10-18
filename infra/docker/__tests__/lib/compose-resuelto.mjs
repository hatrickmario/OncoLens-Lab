/**
 * Resuelve el Compose real (`docker compose config --format json`) con secretos ficticios en un directorio temporal.
 * `override` es el YAML de un `-f` adicional, `archivosExtra` rutas de Compose adicionales (p. ej. el del perfil test)
 * y `entorno` variables extra. Ningún secreto es real (RN-13, RN-14).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const RAIZ = path.resolve(import.meta.dirname, '../../../..');
export const COMPOSE = path.join(RAIZ, 'infra/docker/docker-compose.yml');
export const COMPOSE_TEST = path.join(RAIZ, 'infra/docker/docker-compose.test.yml');
export const ENV_EXAMPLE = path.join(RAIZ, 'infra/docker/.env.example');

export function crearResolutor() {
  const temporal = mkdtempSync(path.join(os.tmpdir(), 'oncolens-compose-'));
  const secretos = path.join(temporal, 'secretos');
  // US-231a: MODEL_HOST_DIR es obligatorio y sin default; la CI no tiene pesos, así que apunta a un directorio vacío fuera del repo.
  const modelos = path.join(temporal, 'modelos');
  mkdirSync(modelos);
  execFileSync(path.join(RAIZ, 'scripts/smoke/lib/fake-secrets.sh'), [secretos], { stdio: 'pipe' });
  let contador = 0;

  function resolver({ override, archivosExtra = [], entorno = {} } = {}) {
    const archivos = ['-f', COMPOSE];
    for (const extra of archivosExtra) archivos.push('-f', extra);
    if (override) {
      const archivo = path.join(temporal, `override-${(contador += 1)}.yml`);
      writeFileSync(archivo, override);
      archivos.push('-f', archivo);
    }
    const salida = execFileSync('docker', ['compose', ...archivos, 'config', '--format', 'json'], {
      // APP_ENV es obligatorio en clinical-api (sin valor por defecto, fallo cerrado): los tests estáticos lo fijan.
      // COMPOSE_PROFILES=seed: los tests estáticos revisan también clinical-seed (perfil `seed`, L1D-169); `entorno`
      // puede vaciarlo para ver lo que arranca con `up` sin perfil.
      env: { ...process.env, APP_ENV: 'test', COMPOSE_PROFILES: 'seed', ONCOLENS_SECRETS_DIR: secretos, MODEL_HOST_DIR: modelos, ...entorno },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return JSON.parse(salida);
  }

  return { resolver, limpiar: () => rmSync(temporal, { recursive: true, force: true }) };
}
