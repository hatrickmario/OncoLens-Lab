import type { Client } from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { conTransaccionRevertida, esperarRechazo } from '../../support/db.js';
import {
  filaDeAnalisis,
  filaDeDiagnostico,
  filaDeEpisodio,
  filaDeGradacionGleason,
  filaDeMiembroDeEquipo,
  filaDeSeguimiento,
  filaDeUsuario,
  generadorDeIds,
  INSTANTE_FIJO,
  insertar,
  insertarContextoClinico,
  sqlInsertar,
  type Fila,
  type GeneradorDeIds,
} from '../../support/filas-sinteticas.js';

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base).
const ESPACIO_DE_IDS = 6;

// Bloque manual de la migración init_full_schema (design D1): cada restricción nombrada se prueba con una fila que la viola.

async function rechazoDe(tabla: string, fila: Fila, cliente: Client): Promise<string | undefined> {
  const { sql, valores } = sqlInsertar(tabla, fila);
  return (await esperarRechazo(cliente, sql, valores)).constraint;
}

async function gradacionBase(cliente: Client, ids: GeneradorDeIds) {
  const contexto = await insertarContextoClinico(cliente, ids);
  const diagnostico = await insertar(cliente, 'clinical.diagnosis', filaDeDiagnostico(ids, contexto.patientId, contexto.episodeId));
  return { contexto, diagnosisId: diagnostico.id as string };
}

describe('CHECK de clinical.diagnosis_grading', () => {
  it.each([
    ['diagnosis_grading_system_ck', { grading_system: 'otro_sistema' }],
    ['diagnosis_grading_specimen_ck', { specimen_type: 'cirugia' }],
    ['diagnosis_grading_scope_ck', { grade_scope: 'parcial' }],
  ])('rechaza por %s la gradación que viola solo ese CHECK [US-038 AC-3]', async (restriccion, variante) => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { diagnosisId } = await gradacionBase(cliente, ids);
      // grading_system fuera de lista no activa los CHECK condicionales: la fila lleva solo la columna de este caso.
      const fila = filaDeGradacionGleason(ids, diagnosisId, variante);

      expect(await rechazoDe('clinical.diagnosis_grading', fila, cliente)).toBe(restriccion);
    });
  });

  // [primario, secundario, ISUP derivado] según DEC-05: 6 → 1, 3+4 → 2, 4+3 → 3, 8 → 4, 9 o 10 → 5.
  it.each([
    [3, 3, 1],
    [3, 4, 2],
    [4, 3, 3],
    [3, 5, 4],
    [4, 4, 4],
    [5, 3, 4],
    [4, 5, 5],
    [5, 4, 5],
    [5, 5, 5],
  ] as const)('deriva el grupo ISUP por el CHECK cuando los patrones son %i+%i [US-038 AC-3]', async (primario, secundario, isup) => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { diagnosisId } = await gradacionBase(cliente, ids);
      const coherente = filaDeGradacionGleason(ids, diagnosisId, {
        gleason_primary_pattern: primario,
        gleason_secondary_pattern: secundario,
        gleason_score: primario + secundario,
        isup_grade_group: isup,
      });
      const incoherente = { ...coherente, id: ids(), isup_grade_group: (isup % 5) + 1 };

      const guardada = await insertar(cliente, 'clinical.diagnosis_grading', coherente);

      expect(guardada.isup_grade_group).toBe(isup);
      expect(await rechazoDe('clinical.diagnosis_grading', incoherente, cliente)).toBe('diagnosis_grading_gleason_ck');
    });
  });
});

describe('CHECK de llm_provider y de clinical.analysis_follow_up', () => {
  async function analisisBase(cliente: Client, ids: GeneradorDeIds) {
    const contexto = await insertarContextoClinico(cliente, ids);
    const analisis = await insertar(cliente, 'clinical.ai_analysis_record', filaDeAnalisis(ids, contexto.patientId, contexto.episodeId, contexto.userId));
    return { contexto, analysisId: analisis.id as string };
  }

  it('rechaza por ai_analysis_record_llm_provider_ck el proveedor que no es local ni nube [US-038 AC-1]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const contexto = await insertarContextoClinico(cliente, ids);
      const fila = filaDeAnalisis(ids, contexto.patientId, contexto.episodeId, contexto.userId, { llm_provider: 'otro' });

      expect(await rechazoDe('clinical.ai_analysis_record', fila, cliente)).toBe('ai_analysis_record_llm_provider_ck');
    });
  });

  it.each([
    ['analysis_follow_up_llm_provider_ck', { llm_provider: 'otro' }],
    ['analysis_follow_up_status_ck', { status: 'desconocido' }],
    ['analysis_follow_up_turn_number_ck', { turn_number: 0 }],
  ])('rechaza por %s el turno que viola ese CHECK [US-038 AC-1]', async (restriccion, variante) => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { analysisId } = await analisisBase(cliente, ids);

      expect(await rechazoDe('clinical.analysis_follow_up', filaDeSeguimiento(ids, analysisId, variante), cliente)).toBe(restriccion);
    });
  });

  it('guarda el turno cuando cumple los tres CHECK [US-038 AC-1]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { analysisId } = await analisisBase(cliente, ids);

      const turno = await insertar(cliente, 'clinical.analysis_follow_up', filaDeSeguimiento(ids, analysisId, { llm_provider: 'nube', status: 'fuera_de_contexto' }));

      expect(turno).toMatchObject({ turn_number: 1, omitted_claims: 0 });
    });
  });
});

describe('Índices únicos parciales', () => {
  async function segundoDoctor(cliente: Client, ids: GeneradorDeIds, roleId: string): Promise<string> {
    return (await insertar(cliente, 'auth."user"', filaDeUsuario(ids, roleId))).id as string;
  }

  it('rechaza por care_team_member_active_uq al mismo doctor activo dos veces en el paciente [US-038 AC-1]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { patientId, userId } = await insertarContextoClinico(cliente, ids);
      await insertar(cliente, 'clinical.care_team_member', filaDeMiembroDeEquipo(ids, patientId, userId));

      expect(await rechazoDe('clinical.care_team_member', filaDeMiembroDeEquipo(ids, patientId, userId), cliente)).toBe('care_team_member_active_uq');
    });
  });

  it('admite la misma asignación cuando la anterior está inactiva [US-038 AC-1]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { patientId, userId } = await insertarContextoClinico(cliente, ids);
      await insertar(cliente, 'clinical.care_team_member', filaDeMiembroDeEquipo(ids, patientId, userId, { is_active: false }));

      const nueva = await insertar(cliente, 'clinical.care_team_member', filaDeMiembroDeEquipo(ids, patientId, userId));

      expect(nueva.is_active).toBe(true);
    });
  });

  it('rechaza por care_team_member_primary_uq al segundo tratante principal activo del paciente [US-038 AC-1]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { patientId, userId, roleId } = await insertarContextoClinico(cliente, ids);
      const otro = await segundoDoctor(cliente, ids, roleId);
      await insertar(cliente, 'clinical.care_team_member', filaDeMiembroDeEquipo(ids, patientId, userId, { is_primary: true }));

      expect(await rechazoDe('clinical.care_team_member', filaDeMiembroDeEquipo(ids, patientId, otro, { is_primary: true }), cliente)).toBe(
        'care_team_member_primary_uq',
      );
    });
  });

  it('rechaza por care_episode_open_uq el segundo episodio abierto del paciente [US-038 AC-1]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { patientId, userId } = await insertarContextoClinico(cliente, ids);

      expect(await rechazoDe('clinical.care_episode', filaDeEpisodio(ids, patientId, userId), cliente)).toBe('care_episode_open_uq');
    });
  });

  it('admite un episodio nuevo cuando el anterior está cerrado [US-038 AC-1]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { patientId, userId, episodeId } = await insertarContextoClinico(cliente, ids);
      await cliente.query('UPDATE clinical.care_episode SET closed_at = $2, closed_by = $3 WHERE id = $1', [episodeId, INSTANTE_FIJO, userId]);

      const nuevo = await insertar(cliente, 'clinical.care_episode', filaDeEpisodio(ids, patientId, userId));

      expect(nuevo.closed_at).toBeNull();
    });
  });
});
