import { describe, expect, it } from 'vitest';
import { datoDelCaso } from '../../lib/conversacion/dato-del-panel';
import { enlacesDelBloque } from '../../lib/conversacion/enlaces-de-datos';
import {
  fragmentoDeCitaDelChat,
  fragmentoDeFuente,
} from '../../lib/conversacion/fragmento-abierto';
import { fuentesDelTurno } from '../../lib/conversacion/fuentes-del-turno';
import { casoDelPaciente, turnoDeCaso } from '../support/msw/conversaciones';
import { turnoDeEvidenciaConFuentes } from '../support/turno-con-fuentes';

const vista = casoDelPaciente as never;
const enlaceDe = (resourceType: string, resourceId: string) =>
  ({ ...turnoDeCaso.dataLinks[1]!, resourceType, resourceId }) as never;

describe('fuentesDelTurno', () => {
  it('lista cada fuente citada una sola vez cuando dos opciones citan la misma', () => {
    const turno = turnoDeEvidenciaConFuentes();
    const opcion = turno.evidenceAnalysis.evidenceOptions[0];
    turno.evidenceAnalysis.evidenceOptions.push({ ...opcion, option: 'otra opción' });

    expect(fuentesDelTurno(turno).map((f) => f.chunkId)).toEqual(
      opcion.citedSources.map((f: { chunkId: string }) => f.chunkId),
    );
  });

  it('devuelve una lista vacía cuando el turno no trae análisis de evidencia', () => {
    expect(fuentesDelTurno(turnoDeCaso as never)).toEqual([]);
  });
});

describe('fragmento abierto', () => {
  it('toma texto y metadatos de la fuente cuando la cita sale de una opción del análisis', () => {
    const [fuente] = fuentesDelTurno(turnoDeEvidenciaConFuentes());

    expect(fragmentoDeFuente(fuente!)).toEqual({
      texto: fuente!.chunkTextSnapshot,
      titulo: fuente!.title,
      ordinal: null,
      fuente,
    });
  });

  it('une la cita del bloque con la fuente del mismo chunkId y conserva su posición', () => {
    const turno = turnoDeEvidenciaConFuentes();
    const cita = turno.blocks[0].citations[1];
    const fragmento = fragmentoDeCitaDelChat(cita, fuentesDelTurno(turno));

    expect(fragmento.fuente?.chunkId).toBe(cita.chunkId);
    expect(fragmento.ordinal).toEqual({ numero: 6, total: 12 });
  });

  it('deja la fuente en null cuando ninguna fuente del análisis comparte el chunkId', () => {
    const turno = turnoDeEvidenciaConFuentes();
    const cita = { ...turno.blocks[0].citations[0], chunkId: 'chunk_ajeno' };

    expect(fragmentoDeCitaDelChat(cita, fuentesDelTurno(turno)).fuente).toBeNull();
  });
});

describe('datoDelCaso', () => {
  it('devuelve el esquema y la procedencia cuando el recurso es un tratamiento previo de la vista', () => {
    const fila = (casoDelPaciente as { priorTreatments: { id: string }[] }).priorTreatments[0]!;

    expect(datoDelCaso(vista, enlaceDe('prior_treatment', fila.id))).toMatchObject({
      valor: 'Deprivación androgénica',
    });
  });

  it('devuelve el valor del atributo cuando el recurso es un atributo clínico de la vista', () => {
    const fila = (casoDelPaciente as { attributes: { id: string }[] }).attributes[0]!;

    expect(datoDelCaso(vista, enlaceDe('clinical_attribute', fila.id))).not.toBeNull();
  });

  it('devuelve null cuando la vista de caso no lleva id del recurso (biomarcador, diagnóstico)', () => {
    expect(
      datoDelCaso(vista, enlaceDe('biomarker', turnoDeCaso.dataLinks[1]!.resourceId)),
    ).toBeNull();
    expect(
      datoDelCaso(vista, enlaceDe('diagnosis', turnoDeCaso.dataLinks[0]!.resourceId)),
    ).toBeNull();
  });

  it('devuelve null cuando el id no está en la vista', () => {
    expect(datoDelCaso(vista, enlaceDe('prior_treatment', 'no-existe'))).toBeNull();
  });
});

describe('enlacesDelBloque', () => {
  const PACIENTE = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';

  it('entrega el enlace del contrato sin ruta propia cuando el factRef lo tiene', () => {
    const [primero] = enlacesDelBloque(
      { factRefs: ['f2', 'f2'] },
      turnoDeCaso.dataLinks as never,
      PACIENTE,
    );

    expect(primero?.enlace.resourceId).toBe(turnoDeCaso.dataLinks[1]!.resourceId);
    expect(primero).not.toHaveProperty('href');
  });

  it('no entrega enlaces cuando el id del paciente no es un UUID', () => {
    expect(enlacesDelBloque({ factRefs: ['f2'] }, turnoDeCaso.dataLinks as never, 'ana')).toEqual(
      [],
    );
  });
});
