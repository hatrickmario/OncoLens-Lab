import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const raizWeb = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('build de producción de web (guard de páginas)', () => {
  it('registra el proxy con el matcher de toda la app salvo estáticos cuando se compila [US-211 AC-4] [US-216 AC-1]', () => {
    execFileSync('npx', ['next', 'build'], {
      cwd: raizWeb,
      env: {
        ...process.env,
        CLINICAL_API_URL: 'http://clinical-api.test:3000',
        WEB_ALLOWED_ORIGIN: 'http://127.0.0.1:3000',
        WEB_UPSTREAM_TIMEOUT_MS: '40000',
        WEB_HOME_PATH: '/pacientes/00000000-0000-4000-8000-000000000001/analisis',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: 'pipe',
    });

    const manifiesto = JSON.parse(
      readFileSync(path.join(raizWeb, '.next', 'server', 'functions-config-manifest.json'), 'utf8'),
    ) as { functions: Record<string, { matchers?: { originalSource: string }[] }> };

    const matchers = manifiesto.functions['/_middleware']?.matchers?.map((m) => m.originalSource);
    expect(matchers).toEqual(['/((?!_next/static|_next/image|icon.svg).*)']);
  }, 300_000);
});
