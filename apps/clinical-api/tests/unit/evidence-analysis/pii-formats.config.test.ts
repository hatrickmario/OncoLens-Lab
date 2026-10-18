import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfiguracionInvalidaError } from '../../../src/config.js';
import { cargarConfiguracionDePii } from '../../../src/modules/evidence-analysis/deidentification/pii-formats.config.js';

const RAIZ_CLINICAL_API = path.resolve(import.meta.dirname, '../../..');
const RAIZ_REPO = path.resolve(RAIZ_CLINICAL_API, '../..');
const RUTA_FORMATOS = path.join(RAIZ_REPO, 'config/pii-formats.json');
const RUTA_MASCARAS = path.join(RAIZ_CLINICAL_API, 'config/pii-masks.json');
const MINIMO_DE_TOKEN = 3;

const textoDe = (ruta: string): string => readFileSync(ruta, 'utf8');
const jsonDe = (ruta: string): Record<string, unknown> =>
  JSON.parse(textoDe(ruta)) as Record<string, unknown>;

/** Lector en memoria: `formatos` y `mascaras` sustituyen a los archivos reales; lo demás se lee de disco. */
function cargar(cambios: { formatos?: unknown; mascaras?: unknown } = {}) {
  const lector = (ruta: string): string => {
    if (ruta === 'formatos.json') {
      return cambios.formatos === undefined ? textoDe(RUTA_FORMATOS) : texto(cambios.formatos);
    }
    if (ruta === 'mascaras.json') {
      return cambios.mascaras === undefined ? textoDe(RUTA_MASCARAS) : texto(cambios.mascaras);
    }
    throw new Error('ENOENT: ruta-secreta-del-servidor');
  };
  return cargarConfiguracionDePii(
    {
      formatsPath: 'formatos.json',
      masksPath: 'mascaras.json',
      nameTokenMinLength: MINIMO_DE_TOKEN,
    },
    lector,
  );
}
const texto = (valor: unknown): string =>
  typeof valor === 'string' ? valor : JSON.stringify(valor);

function variableInvalida(accion: () => unknown): ConfiguracionInvalidaError {
  try {
    accion();
  } catch (error) {
    if (error instanceof ConfiguracionInvalidaError) return error;
    throw error;
  }
  throw new Error('la configuración debía ser inválida');
}

describe('cargarConfiguracionDePii', () => {
  it('carga los formatos de L1D-166 con el marcador de cada tipo y el orden identidad, fechas, formatos cuando los archivos reales son válidos', () => {
    const configuracion = cargar();

    expect(configuracion.formatos.map((formato) => [formato.tipo, formato.marcador])).toEqual([
      ['documento_identidad', '[DOCUMENTO]'],
      ['telefono', '[TELEFONO]'],
      ['telefono', '[TELEFONO]'],
      ['correo', '[CORREO]'],
    ]);
    expect(configuracion.orden).toEqual(['identidad', 'fechas', 'formatos']);
    expect(configuracion.nameTokenMinLength).toBe(MINIMO_DE_TOKEN);
  });

  it('nombra PII_FORMATS_PATH sin citar la ruta cuando el archivo de formatos no existe', () => {
    const error = variableInvalida(() =>
      cargarConfiguracionDePii(
        { formatsPath: '/no/existe.json', masksPath: 'mascaras.json', nameTokenMinLength: 3 },
        (ruta) => {
          throw new Error(`ENOENT ${ruta}`);
        },
      ),
    );

    expect(error.variable).toBe('PII_FORMATS_PATH');
    expect(error.message).not.toContain('/no/existe.json');
  });

  it('nombra PII_FORMATS_PATH cuando el archivo de formatos no es JSON', () => {
    expect(variableInvalida(() => cargar({ formatos: 'esto no es json' })).variable).toBe(
      'PII_FORMATS_PATH',
    );
  });

  it('nombra PII_FORMATS_PATH cuando un patrón del archivo de formatos no compila', () => {
    const formatos = jsonDe(RUTA_FORMATOS) as { formatos: { patron: string }[] };
    const roto = {
      ...formatos,
      formatos: formatos.formatos.map((formato) => ({ ...formato, patron: '(?<valor>[' })),
    };

    expect(variableInvalida(() => cargar({ formatos: roto })).variable).toBe('PII_FORMATS_PATH');
  });

  it('nombra PII_MASKS_PATH cuando el archivo de reglas no existe o no cumple el esquema', () => {
    expect(variableInvalida(() => cargar({ mascaras: '{' })).variable).toBe('PII_MASKS_PATH');
    expect(variableInvalida(() => cargar({ mascaras: { version: 1 } })).variable).toBe(
      'PII_MASKS_PATH',
    );
  });

  it('nombra PII_MASKS_PATH cuando un tipo de pii-formats.json no tiene marcador', () => {
    const mascaras = jsonDe(RUTA_MASCARAS) as { marcadores: Record<string, string> };
    const { correo, ...sinCorreo } = mascaras.marcadores;
    void correo;

    const error = variableInvalida(() =>
      cargar({ mascaras: { ...mascaras, marcadores: sinCorreo } }),
    );

    expect(error.variable).toBe('PII_MASKS_PATH');
  });

  it('nombra PII_MASKS_PATH cuando formatsVersion no coincide con la version de pii-formats.json', () => {
    const mascaras = jsonDe(RUTA_MASCARAS) as { formatsVersion: number };

    const error = variableInvalida(() =>
      cargar({ mascaras: { ...mascaras, formatsVersion: mascaras.formatsVersion + 1 } }),
    );

    expect(error.variable).toBe('PII_MASKS_PATH');
  });

  it('nombra PII_MASKS_PATH cuando el orden repite una etapa', () => {
    const mascaras = jsonDe(RUTA_MASCARAS);

    const error = variableInvalida(() =>
      cargar({ mascaras: { ...mascaras, orden: ['identidad', 'identidad', 'formatos'] } }),
    );

    expect(error.variable).toBe('PII_MASKS_PATH');
  });
});
