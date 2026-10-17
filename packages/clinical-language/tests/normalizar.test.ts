import { describe, expect, it } from 'vitest';
import { claveFlexiva, normalizarTexto } from '../src/index.js';

describe('normalizarTexto', () => {
  it('devuelve cadena vacía cuando el texto no tiene letras ni dígitos', () => {
    expect(normalizarTexto('  ¡¿ ... ?!  ')).toBe('');
  });

  it('pasa a minúsculas y quita las tildes cuando el texto las trae', () => {
    expect(normalizarTexto('RECIBÍR Opción')).toBe('recibir opcion');
  });

  it('convierte la puntuación en espacio y colapsa los espacios cuando hay signos entre palabras', () => {
    expect(normalizarTexto('Uso académico/investigación;  [retirada]')).toBe(
      'uso academico investigacion retirada',
    );
  });
});

describe('claveFlexiva', () => {
  it('quita el enclítico cuando la palabra termina en infinitivo más pronombre', () => {
    expect(claveFlexiva('recibirlo')).toBe('recibir');
    expect(claveFlexiva('iniciarse')).toBe('iniciar');
    expect(claveFlexiva('recibirlos')).toBe('recibir');
  });

  it('quita el plural nominal cuando la palabra termina en s', () => {
    expect(claveFlexiva('pacientes')).toBe('pacient');
    expect(claveFlexiva('opciones')).toBe('opcion');
  });

  it('quita el plural verbal cuando la palabra termina en an o en', () => {
    expect(claveFlexiva('deben')).toBe('deb');
    expect(claveFlexiva('deberian')).toBe('deberi');
  });

  it('une el género cuando la palabra termina en vocal', () => {
    expect(claveFlexiva('recomendada')).toBe(claveFlexiva('recomendado'));
    expect(claveFlexiva('esta')).toBe(claveFlexiva('este'));
  });

  it('deja intactas las palabras de menos de cuatro letras', () => {
    expect(claveFlexiva('los')).toBe('los');
    expect(claveFlexiva('se')).toBe('se');
    expect(claveFlexiva('una')).toBe('una');
  });
});
