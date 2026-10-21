import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Lanza el binario REAL de la CLI (`src/cli/oncolens.ts`) contra la base de test con un entorno CERRADO y TLS
 * verificado. La contraseña del rol de test viaja por archivo (`*_FILE`), como en producción; nada por argumentos.
 */

const RAIZ_APP = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const RAIZ_REPO = resolve(RAIZ_APP, '../..');
const PRECARGA = resolve(RAIZ_APP, 'tests/support/resolver-postgres.cjs');
/** Tiempo máximo explícito de un proceso real (US-045): pasado el plazo se mata y el test falla. */
export const PLAZO_DE_PROCESO_MS = 30_000;

export interface ResultadoDeCli {
  readonly codigo: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface EntornoDeCliDeTest {
  readonly ejecutar: (argumentos: string[], stdin: string) => Promise<ResultadoDeCli>;
  readonly limpiar: () => void;
}

export function entornoDeCliDeTest(urlBase: string): EntornoDeCliDeTest {
  const url = new URL(urlBase);
  const directorio = mkdtempSync(join(tmpdir(), 'cli-test-'));
  const archivoDeClave = join(directorio, 'pg_password');
  writeFileSync(archivoDeClave, decodeURIComponent(url.password), { mode: 0o600 });
  const secretos = process.env['ONCOLENS_SECRETS_DIR'] ?? join(RAIZ_REPO, 'infra/docker/secrets');
  const entorno: Record<string, string> = {
    PATH: process.env['PATH'] ?? '',
    HOME: process.env['HOME'] ?? '',
    NODE_OPTIONS: `--require ${PRECARGA}`,
    CLINICAL_DATABASE_URL: `postgresql://${url.username}@postgres:${url.port}${url.pathname}`,
    PG_CLINICAL_API_PASSWORD_FILE: archivoDeClave,
    CLINICAL_DATABASE_CA_FILE: join(secretos, 'pg_ca.crt'),
    ARGON2_MEMORY_COST_KIB: '8',
    ARGON2_TIME_COST: '1',
    ARGON2_PARALLELISM: '1',
  };
  return {
    limpiar: () => rmSync(directorio, { recursive: true }),
    ejecutar: (argumentos, stdin) =>
      new Promise((resolver, rechazar) => {
        const proceso = spawn(
          process.execPath,
          ['--import', 'tsx', 'src/cli/oncolens.ts', ...argumentos],
          { cwd: RAIZ_APP, env: entorno, timeout: PLAZO_DE_PROCESO_MS },
        );
        let stdout = '';
        let stderr = '';
        proceso.stdout.on('data', (trozo: Buffer) => (stdout += trozo.toString()));
        proceso.stderr.on('data', (trozo: Buffer) => (stderr += trozo.toString()));
        proceso.on('error', rechazar);
        proceso.on('close', (codigo) => resolver({ codigo, stdout, stderr }));
        proceso.stdin.end(stdin);
      }),
  };
}
