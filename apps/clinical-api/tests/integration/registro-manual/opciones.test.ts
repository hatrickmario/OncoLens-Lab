import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RUTA_CATALOGO_FX01BB } from '../../support/catalogo-terminologico.js';
import {
  iniciarEscenarioDeRegistroManual,
  montarRegistroManual,
  sembrarMamaFM2,
  sembrarProstataTnm8,
  sembrarSinDiagnostico,
  type EscenarioDeRegistroManual,
} from '../../support/registro-manual.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9981;
let escenario: EscenarioDeRegistroManual;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeRegistroManual('rm_opciones', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

function leerOpciones(patientId: string, cookie: string | null = escenario.cookieDoctor) {
  const { app } = montarRegistroManual(escenario.mundo, {
    rutaDelChecklist: RUTA_CATALOGO_FX01BB,
  });
  const peticion = clienteVerificado(app).get(
    `/platform/patients/${patientId}/manual-entry-options`,
  );
  return cookie === null ? peticion : peticion.set('Cookie', cookie);
}

function leerChecklist(patientId: string) {
  const { app } = montarRegistroManual(escenario.mundo, {
    rutaDelChecklist: RUTA_CATALOGO_FX01BB,
  });
  return clienteVerificado(app)
    .get(`/platform/patients/${patientId}/completeness`)
    .set('Cookie', escenario.cookieDoctor);
}

interface ItemCritico {
  item: string;
  entity: string;
  field: string | null;
  term: string | null;
}

interface ItemDelCatalogo {
  key: string;
  destination: { entity: string; field?: string; match?: { name?: string } };
}

function itemsDelCatalogo(tipo: string): ItemDelCatalogo[] {
  const ruta = `${RUTA_CATALOGO_FX01BB}/${tipo}/datos-criticos.json`;
  return (JSON.parse(readFileSync(ruta, 'utf8')) as { items: ItemDelCatalogo[] }).items;
}

describe('opciones del registro manual', () => {
  it('devuelve términos, TNM_8, ECOG 0–5, nottingham y el destino de ki67 y grado para F-M2 [US-111 AC-1]', async () => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);

    const respuesta = await leerOpciones(patientId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    expect(respuesta.body).toMatchObject({
      catalogVersion: 'test-normalizacion-1.0.0',
      cancerType: 'mama',
      enabledCancerTypes: ['mama', 'prostata'],
      stagingSystems: ['TNM_8'],
      gradingSystems: ['nottingham'],
    });
    expect(respuesta.body.performanceScales).toContainEqual({
      code: 'ECOG',
      minimum: 0,
      maximum: 5,
    });
    const terminos = (respuesta.body.biomarkerTerms as { term: string }[]).map((t) => t.term);
    expect(terminos).toEqual(expect.arrayContaining(['Ki-67', 'HER2', 'RE']));
    expect(terminos).not.toContain('PSA');
    expect(respuesta.body.criticalItems).toEqual(
      expect.arrayContaining([
        { item: 'ki67', entity: 'Biomarker', field: 'value', term: 'Ki-67' },
        { item: 'grado', entity: 'Diagnosis', field: 'grade', term: null },
      ]),
    );
  });

  it('devuelve gleason_isup y solo los términos de próstata cuando el diagnóstico vigente es de próstata [US-111 AC-3]', async () => {
    const { patientId } = await sembrarProstataTnm8(escenario.siembra);

    const respuesta = await leerOpciones(patientId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({
      cancerType: 'prostata',
      gradingSystems: ['gleason_isup'],
    });
    expect((respuesta.body.biomarkerTerms as { term: string }[]).map((t) => t.term)).toEqual([
      'PSA',
    ]);
  });

  it('devuelve cancerType null y los sistemas de todos los tipos habilitados cuando no hay diagnóstico vigente [US-111 AC-3]', async () => {
    const { patientId } = await sembrarSinDiagnostico(escenario.siembra);

    const respuesta = await leerOpciones(patientId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.cancerType).toBeNull();
    expect(respuesta.body.gradingSystems).toEqual(['nottingham', 'gleason_isup']);
    expect(respuesta.body.stagingSystems).toEqual(['TNM_8']);
    expect((respuesta.body.biomarkerTerms as { term: string }[]).map((t) => t.term)).toEqual(
      expect.arrayContaining(['Ki-67', 'PSA']),
    );
  });

  it('responde 401 sin sesión, 403 al admin y 404 sin datos del paciente [US-111 AC-1]', async () => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);

    const sinSesion = await leerOpciones(patientId, null);
    const admin = await leerOpciones(patientId, escenario.cookieAdmin);
    const inexistente = await leerOpciones('00000000-0000-4000-8000-00000000dead');

    expect(sinSesion.status).toBe(401);
    expect(admin.status).toBe(403);
    expect(admin.body.error).toBe('PERMISO_DENEGADO');
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error).toBe('NO_ENCONTRADO');
  });

  it('criticalItems coincide con el destination del checklist para F-M2 y próstata [US-111 AC-2]', async () => {
    const mama = (await sembrarMamaFM2(escenario.siembra)).patientId;
    const prostata = (await sembrarProstataTnm8(escenario.siembra)).patientId;

    for (const [patientId, tipo] of [
      [mama, 'mama'],
      [prostata, 'prostata'],
    ] as const) {
      const opciones = await leerOpciones(patientId);
      const checklist = await leerChecklist(patientId);
      const items = opciones.body.criticalItems as ItemCritico[];
      const filas = checklist.body.items as {
        item: string;
        destination: { entity: string; field: string | null };
      }[];

      expect(items.map((i) => i.item)).toEqual(filas.map((f) => f.item));
      for (const fila of filas) {
        const critico = items.find((i) => i.item === fila.item);
        expect({ entity: critico?.entity, field: critico?.field }).toEqual(fila.destination);
      }
      for (const delCatalogo of itemsDelCatalogo(tipo)) {
        const critico = items.find((i) => i.item === delCatalogo.key);
        expect(critico?.term).toBe(
          delCatalogo.destination.entity === 'Biomarker'
            ? (delCatalogo.destination.match?.name ?? null)
            : null,
        );
      }
    }
  });
});
