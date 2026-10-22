import { describe, expect, it } from 'vitest';
import { detectarPii } from '../../../ci/pii-scan.mjs';
import { coincidenciasPii, formatosCompilados, PREFIJO_SINTETICO } from '../../../lib/formatosPii.mjs';
import { assertExamplesSynthetic } from '../../rules/assertExamplesSynthetic.mjs';

const arroba = '@';
const correo = (local, dominio) => `${local}${arroba}${dominio}`;
const formatos = formatosCompilados();
const formatoCorreo = formatos.filter((formato) => formato.tipo === 'correo');

const ejemplo = (texto) => ({
  dir: 'contracts/examples',
  index: { examples: [{ file: 'a.json', spec: 'clinical-api' }] },
  files: { 'a.json': { nota: texto } },
});
const correosReportados = (texto) =>
  assertExamplesSynthetic({}, ejemplo(texto)).map((hallazgo) => hallazgo.message.match(/el correo (\S+) no es/)?.[1]).filter(Boolean);

describe('assertExamplesSynthetic · correos', () => {
  const dominios = ['example.com', 'oncolens.test', 'demo.test', 'host.local', 'clinica-ejemplo.org', 'notexample.com'];
  const texto = dominios.map((dominio) => correo('usuario', dominio)).join(' ');

  it('la regla reporta los correos que el formato reconoce y cuyo dominio no es de ejemplo [US-036 AC-4]', () => {
    const delFormato = coincidenciasPii(texto, formatoCorreo, { sinExenciones: true }).map((c) => c.valor);

    expect(delFormato).toHaveLength(dominios.length);
    expect(correosReportados(texto)).toEqual(delFormato.filter((valor) => !/@(example\.(com|org|net)|oncolens\.test|ejemplo\.invalid)$/.test(valor)));
  });

  it('exige un dominio de ejemplo aunque el escáner de PII deje pasar el dominio reservado [US-036 AC-4]', () => {
    expect(correosReportados(correo('usuario', 'demo.test'))).toEqual([correo('usuario', 'demo.test')]);
    expect(detectarPii(correo('usuario', 'demo.test'), formatos)).toEqual([]);
  });

  it('usa el prefijo centinela del formato de documento como única definición de SINT- [US-036 AC-4]', () => {
    expect(PREFIJO_SINTETICO).toBe('SINT-');
  });
});

describe('assertExamplesSynthetic · máscara del documento (L1D-202 D2)', () => {
  const conClave = (clave, valor) => ({
    dir: 'contracts/examples',
    index: { examples: [{ file: 'a.json', spec: 'clinical-api' }] },
    files: { 'a.json': { [clave]: valor } },
  });
  const hallazgos = (clave, valor) => assertExamplesSynthetic({}, conClave(clave, valor)).map((h) => h.message);

  it('acepta la máscara cerrada de nationalIdMasked: cuatro viñetas, un espacio y dos caracteres [US-048 AC-7]', () => {
    expect(hallazgos('nationalIdMasked', '•••• 56')).toEqual([]);
    expect(hallazgos('nationalIdMasked', '•••• 01')).toEqual([]);
  });

  it('sigue exigiendo SINT- a nationalIdMasked cuando el valor no es la máscara cerrada [US-048 AC-7]', () => {
    expect(hallazgos('nationalIdMasked', '1234567')).toHaveLength(1);
    expect(hallazgos('nationalIdMasked', '•••• 4567')).toHaveLength(1);
    expect(hallazgos('nationalIdMasked', '••• 56')).toHaveLength(1);
  });

  it('no extiende la excepción a los campos con el documento en claro [US-048 AC-7]', () => {
    expect(hallazgos('nationalId', '•••• 56')).toHaveLength(1);
    expect(hallazgos('documentNumber', '•••• 56')).toHaveLength(1);
  });
});
