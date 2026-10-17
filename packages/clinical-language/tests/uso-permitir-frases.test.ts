import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadProhibitedTerms } from '../src/index.js';

const RAIZ = resolve(import.meta.dirname, '../../..');
const REGLA = 'scripts/contracts/rules/assertNoPrescriptiveLanguage.mjs';
const LLAMADORES_PERMITIDOS = ['packages/clinical-language/bin/lint-lenguaje.ts', REGLA];
const USO_DE_PERMITIR_FRASES = /permitirFrases\s*:\s*true|permitir_frases\s*=\s*True/;

/** Código versionado fuera de los tests, en los lenguajes del monorepo que pueden llamar al verificador. */
function archivosDeCodigoFueraDeTests(): string[] {
  const versionados = execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  return versionados.filter(
    (archivo) =>
      /\.(ts|tsx|mjs|py)$/.test(archivo) &&
      !/(^|\/)(tests|__tests__)\//.test(archivo) &&
      !archivo.startsWith('.claude/'),
  );
}

type ReglaDeLenguaje = (
  specs: Record<string, { file: string; raw: unknown }>,
  examples: { dir: string; files: Record<string, unknown> },
  docs: { terminosProhibidos: unknown },
) => { path: string; message: string }[];

async function cargarRegla(): Promise<ReglaDeLenguaje> {
  const modulo = (await import(pathToFileURL(resolve(RAIZ, REGLA)).href)) as {
    assertNoPrescriptiveLanguage: ReglaDeLenguaje;
  };
  return modulo.assertNoPrescriptiveLanguage;
}

const FRASE_NEGATIVA = 'no constituye una recomendación';
const SPECS_VACIOS = {
  'clinical-api': { file: 'apps/clinical-api/openapi.yaml', raw: null },
  'rag-orchestrator': { file: 'apps/rag-orchestrator/openapi.yaml', raw: null },
  evidence: { file: 'contracts/schemas/evidence.yaml', raw: null },
};

describe('uso de permitirFrases', () => {
  it('solo lint-lenguaje.ts y assertNoPrescriptiveLanguage.mjs llaman al verificador con permitirFrases y ninguno lo aplica a CAMPOS_GENERADOS [US-068 AC-5]', async () => {
    const conPermitirFrases = archivosDeCodigoFueraDeTests().filter((archivo) =>
      USO_DE_PERMITIR_FRASES.test(readFileSync(resolve(RAIZ, archivo), 'utf8')),
    );

    expect(conPermitirFrases.sort()).toEqual([...LLAMADORES_PERMITIDOS].sort());
    expect(
      conPermitirFrases.some((archivo) => archivo.startsWith('apps/rag-orchestrator/app/')),
    ).toBe(false);
    expect(readFileSync(resolve(RAIZ, REGLA), 'utf8')).toMatch(/permitirFrases\s*:\s*false/);

    const regla = await cargarRegla();
    const lista = loadProhibitedTerms();
    const ejemplo = { evidenceOptions: [{ rationale: FRASE_NEGATIVA }] };
    const porRationale = regla(
      SPECS_VACIOS,
      { dir: 'contracts/examples', files: { 'sintetico.json': ejemplo } },
      {
        terminosProhibidos: lista,
      },
    );
    const porDescripcion = regla(
      {
        ...SPECS_VACIOS,
        'clinical-api': {
          ...SPECS_VACIOS['clinical-api'],
          raw: { info: { description: FRASE_NEGATIVA } },
        },
      },
      { dir: 'contracts/examples', files: {} },
      { terminosProhibidos: lista },
    );

    expect(porRationale.map((hallazgo) => hallazgo.path)).toEqual([
      '#/evidenceOptions/0/rationale',
    ]);
    expect(porDescripcion).toEqual([]);
  });
});
