import { describe, expect, it } from 'vitest';
import { vistaSegunPermiso } from '../../src/middleware/vista-segun-permiso.js';

const sesionCon = (...permisos: string[]) => ({ permisos: new Set(permisos) });

describe('vistaSegunPermiso', () => {
  it('elige default cuando la sesión no tiene clinical:read [US-045 AC-6]', () => {
    const llamadas: string[] = [];
    const vistas = {
      'clinical:read': () => llamadas.push('doctor'),
      default: () => llamadas.push('admin'),
    };

    vistaSegunPermiso(sesionCon('patients:lookup'), vistas)();

    expect(llamadas).toEqual(['admin']);
  });

  it('elige la vista del permiso cuando la sesión lo tiene', () => {
    const vista = vistaSegunPermiso(sesionCon('clinical:read', 'patients:lookup'), {
      'clinical:read': 'PatientSummary',
      default: 'PatientAdminSummary',
    });

    expect(vista).toBe('PatientSummary');
  });

  it('respeta el orden de la lista cuando la sesión tiene varios permisos con vista', () => {
    const vista = vistaSegunPermiso(sesionCon('b:x', 'a:x'), {
      'a:x': 'A',
      'b:x': 'B',
      default: 'D',
    });

    expect(vista).toBe('A');
  });

  it('elige default cuando la sesión no tiene ningún permiso', () => {
    expect(vistaSegunPermiso(sesionCon(), { 'clinical:read': 'X', default: 'D' })).toBe('D');
  });
});
