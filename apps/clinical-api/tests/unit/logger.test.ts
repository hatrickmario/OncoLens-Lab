import { describe, expect, it } from 'vitest';
import { CAMPOS_SENSIBLES_BASE, crearRegistrador } from '../../src/infrastructure/logger.js';

function registrarYLeer(
  linea: Record<string, unknown>,
  camposSensiblesExtra: readonly string[] = [],
): Record<string, unknown> {
  const salida: string[] = [];
  crearRegistrador((texto) => salida.push(texto), { camposSensiblesExtra })(linea);
  return JSON.parse(salida[0] ?? '{}') as Record<string, unknown>;
}

describe('crearRegistrador', () => {
  it('escribe una línea JSON con los campos tal cual cuando no hay campos sensibles', () => {
    expect(registrarYLeer({ event: 'auth.login', resultado: 'ok', traceId: 'req_1' })).toEqual({
      event: 'auth.login',
      resultado: 'ok',
      traceId: 'req_1',
    });
  });

  it.each(['password', 'cookie', 'set-cookie', 'authorization'])('redacta el campo %s', (campo) => {
    expect(registrarYLeer({ [campo]: 'valor-secreto' })).toEqual({ [campo]: '[REDACTADO]' });
  });

  it('redacta sin distinguir mayúsculas y en objetos anidados', () => {
    const linea = registrarYLeer({
      req: { headers: { Cookie: 'oncolens_session=abc', Authorization: 'Bearer x', host: 'h' } },
      res: { headers: { 'Set-Cookie': ['oncolens_session=abc'] } },
      datos: { Password: 'p', ciudad: 'c' },
    });

    expect(JSON.stringify(linea)).not.toMatch(/abc|Bearer x|"p"/);
    expect(linea).toMatchObject({ req: { headers: { host: 'h' } }, datos: { ciudad: 'c' } });
  });

  it('redacta dentro de arreglos', () => {
    const linea = registrarYLeer({ intentos: [{ password: 'p1' }, { password: 'p2' }] });

    expect(JSON.stringify(linea)).not.toMatch(/p1|p2/);
  });
});

const CAMPOS_DE_DESIGN_D5 = [
  'body',
  'question',
  'identification',
  'name',
  'fullName',
  'nationalId',
  'documentNumber',
  'originalFilename',
  'email',
  'ip',
  'remoteAddress',
  'x-forwarded-for',
  'cookie',
  'set-cookie',
  'authorization',
  'password',
  'birthDate',
  'phone',
  'address',
  'legalRepresentative',
  'query',
  'token',
  'sessionToken',
  'secret',
  'clinicalContext',
  'clinicalNotes',
];

describe('descarte de campos sensibles', () => {
  it.each(CAMPOS_DE_DESIGN_D5)(
    'redacta %s en cualquier profundidad y sin distinguir mayúsculas cuando es parte de la base [US-037 AC-5]',
    (campo) => {
      const linea = registrarYLeer({ nivel: { [campo.toUpperCase()]: 'valor-sintetico-1' } });

      expect(JSON.stringify(linea)).not.toContain('valor-sintetico-1');
    },
  );

  it('redacta el cuerpo completo cuando la línea trae body, sin dejar ninguno de sus subcampos [US-037 AC-5]', () => {
    const linea = registrarYLeer({ body: { query: 'texto-sintetico', patientId: 'x' } });

    expect(linea).toEqual({ body: '[REDACTADO]' });
  });

  it('redacta email y el campo extra y mantiene la base cuando LOG_REDACT_EXTRA_FIELDS añade uno [US-037 AC-5]', () => {
    const linea = registrarYLeer(
      { email: 'a@b.test', notaInterna: 'nota-sintetica', name: 'nombre-sintetico', ok: 'visible' },
      ['notaInterna'],
    );

    expect(linea).toEqual({
      email: '[REDACTADO]',
      notaInterna: '[REDACTADO]',
      name: '[REDACTADO]',
      ok: 'visible',
    });
  });

  it('mantiene redactados todos los campos de la base cuando la lista extra está vacía o repite un campo de la base [US-037 AC-5]', () => {
    for (const extra of [[], ['name'], ['Email', 'otro']]) {
      const entrada = Object.fromEntries(CAMPOS_DE_DESIGN_D5.map((c) => [c, 'valor-sintetico-2']));
      const salida = registrarYLeer(entrada, extra);

      expect(JSON.stringify(salida)).not.toContain('valor-sintetico-2');
    }
  });

  it('declara en la base cerrada todos los campos de design D5 y no se puede mutar en ejecución [US-037 AC-5]', () => {
    const base = CAMPOS_SENSIBLES_BASE.map((c) => c.toLowerCase());

    for (const campo of CAMPOS_DE_DESIGN_D5) expect(base).toContain(campo.toLowerCase());
    expect(Object.isFrozen(CAMPOS_SENSIBLES_BASE)).toBe(true);
  });

  it('redacta query anidado en un request, que es el texto libre del análisis (EvidenceAnalysisRequest.query) [US-037 AC-5]', () => {
    const pregunta = `¿Qué opciones describe la evidencia para ${'Lucía Rondón'}, documento ${['123', '4567'].join('')}?`;

    const linea = registrarYLeer({ event: 'x', request: { patientId: 'u', query: pregunta } });

    expect(JSON.stringify(linea)).not.toContain('Lucía');
    expect(JSON.stringify(linea)).not.toContain(['123', '4567'].join(''));
    expect(linea).toMatchObject({ request: { patientId: 'u', query: '[REDACTADO]' } });
  });

  it('reduce un Error a su clase y su code, sin message, pila ni propiedades como el detail de pg [US-037 AC-5]', () => {
    const error = Object.assign(new TypeError('falla con Lucía Rondón'), {
      code: '23505',
      detail: 'Key (national_id)=(valor-sintetico) already exists.',
    });

    const linea = registrarYLeer({ event: 'pool_error', error });

    expect(linea).toEqual({
      event: 'pool_error',
      error: { errorClase: 'TypeError', code: '23505' },
    });
  });

  it('reduce un Error sin code a solo su clase [US-037 AC-5]', () => {
    expect(registrarYLeer({ error: new Error('mensaje con datos') })).toEqual({
      error: { errorClase: 'Error' },
    });
  });
});
