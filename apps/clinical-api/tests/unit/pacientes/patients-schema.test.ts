import { describe, expect, it } from 'vitest';
import {
  leerBusqueda,
  leerFiltrosDelListado,
} from '../../../src/modules/patients/patients.schema.js';

describe('leerBusqueda', () => {
  it('devuelve el criterio de documento cuando el cuerpo trae idType y nationalId', () => {
    expect(leerBusqueda({ idType: 'sintetico', nationalId: 'SINT-0000001' })).toEqual({
      criterio: { tipo: 'documento', idType: 'sintetico', nationalId: 'SINT-0000001' },
      page: 1,
    });
  });

  it('devuelve el criterio de nombre cuando el cuerpo solo trae name', () => {
    expect(leerBusqueda({ name: 'Prueba Sintética 1', page: 2 })).toEqual({
      criterio: { tipo: 'nombre', name: 'Prueba Sintética 1' },
      page: 2,
    });
  });

  it('prefiere el documento cuando el cuerpo trae documento y nombre', () => {
    const busqueda = leerBusqueda({
      idType: 'sintetico',
      nationalId: 'SINT-0000001',
      name: 'Prueba Sintética 1',
    });

    expect(busqueda?.criterio.tipo).toBe('documento');
  });

  it('rechaza el cuerpo vacío', () => {
    expect(leerBusqueda({})).toBeUndefined();
  });

  it('rechaza un idType sin nationalId y sin nombre', () => {
    expect(leerBusqueda({ idType: 'sintetico' })).toBeUndefined();
  });

  it('rechaza un nombre de un solo carácter', () => {
    expect(leerBusqueda({ name: 'P' })).toBeUndefined();
  });

  it('rechaza un campo que el contrato no declara', () => {
    expect(leerBusqueda({ name: 'Prueba Sintética 1', apellido: 'Sintética' })).toBeUndefined();
  });
});

describe('leerFiltrosDelListado', () => {
  it('convierte page de texto a entero cuando llega en la query', () => {
    const filtros = leerFiltrosDelListado({ page: '2', status: 'activo' });

    expect(filtros.success && filtros.data).toEqual({ page: 2, status: 'activo' });
  });

  it('usa la página 1 cuando la query no trae page', () => {
    const filtros = leerFiltrosDelListado({});

    expect(filtros.success && filtros.data.page).toBe(1);
  });

  it('rechaza page=0 y page no numérico', () => {
    expect(leerFiltrosDelListado({ page: '0' }).success).toBe(false);
    expect(leerFiltrosDelListado({ page: 'abc' }).success).toBe(false);
  });

  it('rechaza un parámetro que no es un filtro sin identidad', () => {
    expect(leerFiltrosDelListado({ name: 'Prueba' }).success).toBe(false);
  });
});
