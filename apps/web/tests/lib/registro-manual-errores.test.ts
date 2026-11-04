import { describe, expect, it } from 'vitest';
import biomarcadorManual from '../../../../contracts/examples/biomarker-manual.json';
import biomarcadorNoMapeado from '../../../../contracts/examples/biomarker-manual-no-mapeado.json';
import errorGradacion from '../../../../contracts/examples/error-gradacion-incoherente-campo.json';
import errorGradacionSinCampo from '../../../../contracts/examples/error-gradacion-incoherente.json';
import errorPacienteEgresado from '../../../../contracts/examples/error-paciente-egresado.json';
import errorValorFueraDeRango from '../../../../contracts/examples/error-valor-fuera-de-catalogo-campo.json';
import {
  biomarcadorSinCodigo,
  cuerpoDeBiomarcador,
  erroresDelBiomarcador,
} from '../../lib/registro-manual/biomarcador';
import { biomarcadorCreado } from '../support/registro-manual-formularios-ui';
import { errorDelServidor } from '../../lib/registro-manual/errores-del-servidor';
import { mensajes } from '../../lib/mensajes';

const { errores } = mensajes().registroManual;

describe('errorDelServidor', () => {
  it('nombra el campo con el texto de rango cuando el valor funcional sale del catálogo', () => {
    expect(errorDelServidor(422, errorValorFueraDeRango)).toEqual({
      campo: 'performanceValue',
      mensaje: errores.valorFueraDeRango,
    });
  });

  it('nombra el campo de gradación cuando la gradación es incoherente', () => {
    expect(errorDelServidor(422, errorGradacion)).toEqual({
      campo: 'grading',
      mensaje: errores.gradacionIncoherente,
    });
  });

  it('devuelve un error sin campo cuando el 422 no trae field', () => {
    expect(errorDelServidor(422, errorGradacionSinCampo)).toEqual({ mensaje: errores.generico });
  });

  it('devuelve el aviso de egreso sin campo cuando el paciente está egresado', () => {
    expect(errorDelServidor(422, errorPacienteEgresado)).toEqual({ mensaje: errores.egresado });
  });

  it('devuelve el texto de permiso, de no encontrado y el genérico por estado', () => {
    expect(errorDelServidor(403, null)).toEqual({ mensaje: errores.permiso });
    expect(errorDelServidor(404, null)).toEqual({ mensaje: errores.noEncontrado });
    expect(errorDelServidor(500, { error: 'ERROR_INTERNO' })).toEqual({
      mensaje: errores.generico,
    });
  });

  it('nunca repite el message del servidor', () => {
    expect(JSON.stringify(errorDelServidor(422, errorGradacion))).not.toContain(
      errorGradacion.message,
    );
  });
});

function datos(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe('cuerpoDeBiomarcador', () => {
  it('arma el cuerpo del contrato y recorta los espacios', () => {
    const cuerpo = cuerpoDeBiomarcador(
      datos({ ...biomarcadorManual, name: ' Ki-67 ', value: '20', unit: '%' }),
    );

    expect(cuerpo).toEqual(biomarcadorManual);
  });

  it('no envía la unidad cuando está vacía', () => {
    expect(cuerpoDeBiomarcador(datos({ ...biomarcadorManual, unit: '' }))).not.toHaveProperty(
      'unit',
    );
  });
});

describe('erroresDelBiomarcador', () => {
  it('no marca nada con un cuerpo completo', () => {
    expect(erroresDelBiomarcador(cuerpoDeBiomarcador(datos(biomarcadorManual)))).toEqual({});
  });

  it('exige nombre, valor, tipo de resultado y fecha', () => {
    expect(erroresDelBiomarcador(cuerpoDeBiomarcador(datos({})))).toEqual({
      name: errores.obligatorio,
      value: errores.obligatorio,
      resultType: errores.obligatorio,
      performedAt: errores.obligatorio,
    });
  });
});

describe('biomarcadorSinCodigo', () => {
  it('devuelve verdadero cuando el servidor lo dejó no_mapeado', () => {
    expect(biomarcadorSinCodigo(biomarcadorNoMapeado)).toBe(true);
  });

  it('devuelve falso cuando quedó mapeado o la respuesta no es un biomarcador', () => {
    expect(biomarcadorSinCodigo(biomarcadorCreado)).toBe(false);
    expect(biomarcadorCreado.provenance.entryMethod).toBe('manual');
    expect(biomarcadorSinCodigo({ algo: 1 })).toBe(false);
  });
});
