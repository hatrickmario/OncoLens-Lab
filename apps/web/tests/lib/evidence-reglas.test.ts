import { describe, expect, it } from 'vitest';
import conEvidencia from '../../../../contracts/examples/con-evidencia-s1.json';
import conEvidenciaSinOpciones from '../../../../contracts/examples/con-evidencia-sin-opciones.json';
import conEvidenciaSoloDescartadas from '../../../../contracts/examples/con-evidencia-solo-descartadas.json';
import sinEvidencia from '../../../../contracts/examples/sin-evidencia.json';
import { clasificarFallo, mensajeDeError } from '../../lib/evidence/clasificar-fallo';
import { clasificarResultado } from '../../lib/evidence/clasificar-resultado';
import conAplicabilidad from '../../../../contracts/examples/con-evidencia-s3-aplicabilidad.json';
import { anunciarEstado } from '../../lib/evidence/anuncio-de-estado';
import { tieneAplicabilidadCalculada } from '../../lib/evidence/aplicabilidad-calculada';
import {
  elegirBaseDeRelevancia,
  elegirCriterioDeOrden,
} from '../../lib/evidence/criterio-de-orden';
import { faseTrasSolicitud } from '../../lib/evidence/fase-del-panel';
import {
  leerRetryAfter,
  MAXIMO_PREGUNTA,
  puedeEnviar,
  validarPregunta,
} from '../../lib/evidence/reglas-del-formulario';
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

  it('devuelve tipo_no_habilitado cuando el estado es tipo_no_habilitado', () => {
    expect(clasificarResultado({ ...conEvidencia, status: 'tipo_no_habilitado' } as never)).toBe(
      'tipo_no_habilitado',
    );
  });

  it('devuelve no_soportado cuando el estado no existe en el contrato', () => {
    expect(clasificarResultado({ ...conEvidencia, status: 'otro_estado' } as never)).toBe(
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

  it('devuelve la clave de la salida no validada para 503 LLM_OUTPUT_INVALID y la del modelo no disponible para cualquier otro 503 [US-245 AC-1]', () => {
    expect(mensajeDeError(503, 'LLM_OUTPUT_INVALID')).toBe('evidence.error.salidaNoValidada');
    expect(mensajeDeError(503, null)).toBe('evidence.error.modeloNoDisponible');
  });

  it('devuelve la clave del tiempo agotado para 504', () => {
    expect(mensajeDeError(504)).toBe('evidence.error.tiempoAgotado');
  });

  it.each([502, 500, 400, 0])('devuelve la clave genérica para %i', (estado) => {
    expect(mensajeDeError(estado)).toBe('evidence.error.generico');
  });
});

describe('puedeEnviar', () => {
  it('permite enviar cuando no hay otro análisis en curso y la pregunta no está vacía', () => {
    expect(puedeEnviar(false, 'Pregunta')).toBe(true);
  });

  it('rechaza enviar cuando ya hay un análisis en curso', () => {
    expect(puedeEnviar(true, 'Pregunta')).toBe(false);
  });

  it('rechaza enviar cuando la pregunta solo tiene espacios', () => {
    expect(puedeEnviar(false, '   ')).toBe(false);
  });
});

describe('validarPregunta', () => {
  it('toma el máximo del schema del contrato', () => {
    expect(MAXIMO_PREGUNTA).toBe(2000);
  });

  it('acepta una pregunta de exactamente el máximo', () => {
    expect(validarPregunta('a'.repeat(2000))).toEqual({ ok: true });
  });

  it('devuelve el máximo cuando la pregunta lo excede en uno', () => {
    expect(validarPregunta('a'.repeat(2001))).toEqual({ ok: false, max: 2000 });
  });
});

describe('leerRetryAfter', () => {
  const con = (valor: string | null) => new Headers(valor === null ? {} : { 'Retry-After': valor });

  it('devuelve los segundos cuando la cabecera es un entero', () => {
    expect(leerRetryAfter(con('30'))).toBe(30);
  });

  it('devuelve 0 cuando la cabecera es 0', () => {
    expect(leerRetryAfter(con('0'))).toBe(0);
  });

  it('devuelve null cuando el plazo supera una hora', () => {
    expect(leerRetryAfter(con('3601'))).toBeNull();
    expect(leerRetryAfter(con('3600'))).toBe(3600);
  });

  it.each([null, 'pronto', '-5', '1.5', 'Wed, 21 Oct 2026 07:28:00 GMT', ''])(
    'devuelve null cuando la cabecera es %j',
    (valor) => {
      expect(leerRetryAfter(con(valor))).toBeNull();
    },
  );
});

describe('aplicabilidad calculada y orden elegido por la respuesta', () => {
  const calculada = conAplicabilidad.evidenceOptions[0]!;
  const noCalculada = conEvidencia.evidenceOptions[0]!;

  it('detecta aplicabilidad calculada solo cuando perSource no está vacío', () => {
    expect(tieneAplicabilidadCalculada(calculada as never)).toBe(true);
    expect(tieneAplicabilidadCalculada(noCalculada as never)).toBe(false);
  });

  it('elige el criterio por aplicabilidad cuando toda opción trae aplicabilidad calculada', () => {
    expect(elegirCriterioDeOrden(conAplicabilidad as never)).toBe(
      'evidence.orderCriterion.applicability',
    );
  });

  it('elige el criterio neutro cuando alguna opción no trae aplicabilidad calculada', () => {
    const mixta = { evidenceOptions: [calculada, noCalculada] };
    expect(elegirCriterioDeOrden(mixta as never)).toBe('evidence.orderCriterion.relevance');
  });

  it('elige el criterio neutro cuando no hay opciones', () => {
    expect(elegirCriterioDeOrden({ evidenceOptions: [] })).toBe(
      'evidence.orderCriterion.relevance',
    );
  });

  it('elige la base que dice que solo desempata cuando la opción trae aplicabilidad calculada', () => {
    expect(elegirBaseDeRelevancia(calculada as never)).toBe('evidence.relevance.basis');
    expect(elegirBaseDeRelevancia(noCalculada as never)).toBe('evidence.relevance.basisRelevancia');
  });
});

describe('faseTrasSolicitud', () => {
  it('conserva la fase límite con su plazo cuando la solicitud fue limitada', () => {
    expect(faseTrasSolicitud({ tipo: 'limite', reintentarEnSegundos: 30 })).toEqual({
      tipo: 'limite',
      reintentarEnSegundos: 30,
    });
  });

  it('conserva la fase red cuando falló la conexión', () => {
    expect(faseTrasSolicitud({ tipo: 'red' })).toEqual({ tipo: 'red' });
  });

  it('no anuncia nada aparte cuando la fase es límite o red porque su aviso es la región de estado', () => {
    expect(anunciarEstado({ tipo: 'limite', reintentarEnSegundos: 30 })).toBe('');
    expect(anunciarEstado({ tipo: 'red' })).toBe('');
  });
});
