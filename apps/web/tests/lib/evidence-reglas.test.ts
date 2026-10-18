import { describe, expect, it } from 'vitest';
import conEvidencia from '../../../../contracts/examples/con-evidencia-s1.json';
import conEvidenciaSinOpciones from '../../../../contracts/examples/con-evidencia-sin-opciones.json';
import conEvidenciaSoloDescartadas from '../../../../contracts/examples/con-evidencia-solo-descartadas.json';
import sinEvidencia from '../../../../contracts/examples/sin-evidencia.json';
import { clasificarFallo, mensajeDeError } from '../../lib/evidence/clasificar-fallo';
import { clasificarResultado } from '../../lib/evidence/clasificar-resultado';
import { elegirCriterioDeOrden } from '../../lib/evidence/criterio-de-orden';
import { formatearRelevancia } from '../../lib/evidence/formatear-relevancia';
import { esUrlHttpSegura, valorONoDisponible } from '../../lib/evidence/procedencia';
import { mensajes } from '../../lib/mensajes';

const { evidence } = mensajes();

describe('clasificarResultado', () => {
  it('devuelve con_opciones cuando hay al menos una opción descrita', () => {
    expect(clasificarResultado(conEvidencia as never)).toBe('con_opciones');
  });

  it('devuelve solo_descartadas cuando no hay opciones y sí descartadas', () => {
    expect(clasificarResultado(conEvidenciaSoloDescartadas as never)).toBe('solo_descartadas');
  });

  it('devuelve sin_opciones cuando con_evidencia no trae opciones ni descartadas', () => {
    expect(clasificarResultado(conEvidenciaSinOpciones as never)).toBe('sin_opciones');
  });

  it('devuelve sin_evidencia cuando el estado es sin_evidencia', () => {
    expect(clasificarResultado(sinEvidencia as never)).toBe('sin_evidencia');
  });

  it('devuelve no_soportado cuando el estado es otro, como tipo_no_habilitado', () => {
    expect(clasificarResultado({ ...conEvidencia, status: 'tipo_no_habilitado' } as never)).toBe(
      'no_soportado',
    );
  });
});

describe('elegirCriterioDeOrden', () => {
  it('devuelve la clave neutra de relevancia cuando applicability está vacío', () => {
    expect(elegirCriterioDeOrden(conEvidencia as never)).toBe('evidence.orderCriterion.relevance');
  });

  it('devuelve la clave neutra también con applicability no vacío porque el S1 no construye ese orden', () => {
    const conAplicabilidad = { ...conEvidencia, applicability: [{}] };
    expect(elegirCriterioDeOrden(conAplicabilidad as never)).toBe(
      'evidence.orderCriterion.relevance',
    );
  });
});

describe('formatearRelevancia', () => {
  it('usa coma decimal y dos decimales', () => {
    expect(formatearRelevancia(0.87)).toBe('0,87');
  });

  it('completa los decimales cuando el valor es redondo', () => {
    expect(formatearRelevancia(0.6)).toBe('0,60');
  });

  it('devuelve no aplica y no 0,00 cuando el valor es null', () => {
    expect(formatearRelevancia(null)).toBe(evidence.resultado.noAplica);
  });

  it('devuelve 0,00 cuando el valor es el número 0', () => {
    expect(formatearRelevancia(0)).toBe('0,00');
  });
});

describe('valorONoDisponible', () => {
  it('devuelve el valor cuando existe', () => {
    expect(valorONoDisponible('guia')).toBe('guia');
  });

  it.each([null, undefined, '', '   '])('devuelve No disponible cuando el valor es %j', (valor) => {
    expect(valorONoDisponible(valor)).toBe('No disponible');
  });
});

describe('esUrlHttpSegura', () => {
  it('acepta https', () => {
    expect(esUrlHttpSegura('https://corpus.oncolens.test/documentos/1')).toBe(true);
  });

  it('acepta http solo en localhost y en dominios .test', () => {
    expect(esUrlHttpSegura('http://localhost:3000/x')).toBe(true);
    expect(esUrlHttpSegura('http://corpus.oncolens.test/x')).toBe(true);
    expect(esUrlHttpSegura('http://ejemplo.org/x')).toBe(false);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'ftp://a.org/x',
    'no es url',
    '',
    null,
  ])('rechaza %j', (url) => {
    expect(esUrlHttpSegura(url)).toBe(false);
  });
});

describe('clasificarFallo', () => {
  it('devuelve no_realizado cuando es 422 con TIPO_CANCER_NO_REGISTRADO', () => {
    expect(clasificarFallo(422, 'TIPO_CANCER_NO_REGISTRADO')).toBe('no_realizado');
  });

  it('devuelve error cuando el 422 trae otro código o ninguno', () => {
    expect(clasificarFallo(422, null)).toBe('error');
  });

  it('devuelve error cuando el código está pero el estado HTTP no es 422', () => {
    expect(clasificarFallo(502, 'TIPO_CANCER_NO_REGISTRADO')).toBe('error');
  });
});

describe('mensajeDeError', () => {
  it('devuelve la clave del modelo no disponible para 503', () => {
    expect(mensajeDeError(503)).toBe('evidence.error.modeloNoDisponible');
  });

  it('devuelve la clave del tiempo agotado para 504', () => {
    expect(mensajeDeError(504)).toBe('evidence.error.tiempoAgotado');
  });

  it.each([502, 500, 400, 0])('devuelve la clave genérica para %i', (estado) => {
    expect(mensajeDeError(estado)).toBe('evidence.error.generico');
  });
});
