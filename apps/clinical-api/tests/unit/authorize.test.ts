import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { PermisoDenegadoError } from '../../src/infrastructure/http-errores.js';
import { authorize, permisosExigidos } from '../../src/middleware/authorize.js';

function ejecutar(codigos: string[], permisos: string[] | undefined) {
  const llamadas: unknown[] = [];
  const request = {
    ...(permisos !== undefined && {
      sesion: { userId: 'u', rol: 'cualquiera', permisos: new Set(permisos) },
    }),
  } as unknown as Request;
  authorize(...codigos)(
    request,
    {} as Response,
    ((error?: unknown) => {
      llamadas.push(error);
    }) as NextFunction,
  );
  return llamadas;
}

describe('authorize', () => {
  it('deja pasar cuando la sesión tiene el permiso', () => {
    expect(ejecutar(['ai_analysis:create'], ['ai_analysis:create'])).toEqual([undefined]);
  });

  it('deja pasar cuando la sesión tiene alguno de la lista', () => {
    expect(ejecutar(['clinical:read', 'patients:lookup'], ['patients:lookup'])).toEqual([
      undefined,
    ]);
  });

  it('rechaza con PermisoDenegadoError cuando la sesión no tiene ninguno', () => {
    const [error] = ejecutar(['clinical:read', 'patients:lookup'], ['session:logout']);

    expect(error).toBeInstanceOf(PermisoDenegadoError);
  });

  it('rechaza cuando no hay sesión', () => {
    expect(ejecutar(['clinical:read'], undefined)[0]).toBeInstanceOf(PermisoDenegadoError);
  });

  it('expone los códigos con los que se montó', () => {
    expect(permisosExigidos(authorize('a:b', 'c:d'))).toEqual(['a:b', 'c:d']);
    expect(permisosExigidos(() => undefined)).toBeUndefined();
  });
});
