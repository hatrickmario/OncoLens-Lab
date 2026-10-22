import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearDetectorOpcionA } from '../../../src/modules/evidence-analysis/deidentification/pii-detector.opcion-a.js';
import { cargarConfiguracionDePii } from '../../../src/modules/evidence-analysis/deidentification/pii-formats.config.js';

const RAIZ_CLINICAL_API = path.resolve(import.meta.dirname, '../../..');
const RAIZ_REPO = path.resolve(RAIZ_CLINICAL_API, '../..');
const RUTA_FORMATOS = path.join(RAIZ_REPO, 'config/pii-formats.json');
const RUTA_MASCARAS = path.join(RAIZ_CLINICAL_API, 'config/pii-masks.json');
const MINIMO_DE_TOKEN = 3;

/** Palabras clave de documentos de identidad y registros de varios países: solo pueden vivir en la configuración. */
const PALABRAS_CLAVE_DE_PAIS =
  /c[eé]dula|\bDNI\b|\bCURP\b|\bNUIP\b|\bRUT\b|\bNIE\b|\bNIF\b|\bCPF\b|\bRFC\b|pasaporte|passport/i;
/** Un cuantificador de dígitos con cifra fija (`\d{8}`) es la firma de un formato de país escrito en código. */
const CUANTIFICADOR_DE_DIGITOS = /\\d\{\d/;

function archivosTs(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(directorio, entrada.name);
    if (entrada.isDirectory()) return archivosTs(ruta);
    return entrada.name.endsWith('.ts') ? [ruta] : [];
  });
}

/** Sin comentarios: la prosa puede nombrar un documento; el código no puede codificarlo. */
const sinComentarios = (fuente: string): string =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function configuracionConFormatoExtra() {
  const formatos = JSON.parse(readFileSync(RUTA_FORMATOS, 'utf8')) as {
    formatos: Array<Record<string, unknown>>;
  };
  formatos.formatos.push({
    id: 'registro_ficticio',
    tipo: 'documento_identidad',
    patron: '(?:REGFICT)[^\\n\\d]{0,8}(?<valor>\\d{9})(?!\\d)',
    banderas: 'iu',
    digitosMin: 9,
    digitosMax: 9,
  });
  const lector = (ruta: string): string =>
    ruta === 'formatos.json' ? JSON.stringify(formatos) : readFileSync(RUTA_MASCARAS, 'utf8');
  return cargarConfiguracionDePii(
    {
      formatsPath: 'formatos.json',
      masksPath: 'mascaras.json',
      nameTokenMinLength: MINIMO_DE_TOKEN,
    },
    lector,
  );
}

describe('formatos de PII por país', () => {
  it('no hay palabras clave ni cuantificadores de documentos de país en el código de clinical-api cuando se excluyen los comentarios [US-013 AC-4]', () => {
    const infractores = archivosTs(path.join(RAIZ_CLINICAL_API, 'src'))
      .filter((archivo) => {
        const codigo = sinComentarios(readFileSync(archivo, 'utf8'));
        return PALABRAS_CLAVE_DE_PAIS.test(codigo) || CUANTIFICADOR_DE_DIGITOS.test(codigo);
      })
      .map((archivo) => path.relative(RAIZ_CLINICAL_API, archivo));

    expect(infractores).toEqual([]);
  });

  it('enmascara un formato nuevo declarado solo en config/pii-formats.json cuando no cambia ninguna línea de código [US-013 AC-4]', () => {
    const detector = crearDetectorOpcionA(null, configuracionConFormatoExtra());

    const resultado = detector.enmascarar(['REGFICT', ' ', '123456789'].join(''));

    expect(resultado.texto).toBe('REGFICT [DOCUMENTO]');
    expect(resultado.findingTypes).toEqual(['documento_identidad']);
  });

  it('declara las palabras clave de más de un país en config/pii-formats.json cuando los formatos viven solo en configuración [US-013 AC-4]', () => {
    const configuracion = readFileSync(RUTA_FORMATOS, 'utf8');

    expect(configuracion).toMatch(/c[eé]dula/i);
    expect(configuracion).toMatch(/\bDNI\b/);
  });
});
