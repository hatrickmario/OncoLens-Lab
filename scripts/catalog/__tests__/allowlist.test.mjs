import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ENTIDADES_CLINICAS,
  RUTA_ALLOWLIST,
  RUTA_MODELO,
  generarAllowlist,
  serializar,
} from '../generar-allowlist.mjs';

const modelo = readFileSync(RUTA_MODELO, 'utf8');

describe('allowlist del modelo generada desde Prisma', () => {
  it('coincide con la commiteada cuando el modelo no cambió [US-001 AC-4]', async () => {
    const regenerada = serializar(await generarAllowlist(modelo));

    expect(regenerada).toBe(readFileSync(RUTA_ALLOWLIST, 'utf8'));
  });

  it('contiene solo las seis entidades clínicas y excluye identidad, cuentas, auditoría y texto libre [US-001 AC-4]', async () => {
    const { entidades } = await generarAllowlist(modelo);

    expect(Object.keys(entidades).sort()).toEqual([...ENTIDADES_CLINICAS].sort());
    for (const prohibida of ['PatientIdentity', 'User', 'Session', 'AuditLog', 'ClinicalNote']) {
      expect(entidades).not.toHaveProperty(prohibida);
    }
  });

  it('nombra los campos por columna y enlaza Biomarker con Exam por la relación exam [US-001 AC-4]', async () => {
    const { entidades } = await generarAllowlist(modelo);

    expect(entidades['Diagnosis'].campos).toContain('stage_value');
    expect(entidades['ClinicalAttribute'].campos).toContain('attribute_key');
    expect(entidades['Exam'].campos).toContain('exam_type');
    expect(entidades['Biomarker'].relaciones).toEqual({ exam: 'Exam' });
  });

  it('excluye como destino las columnas de control y de texto libre [US-001 AC-4]', async () => {
    const { entidades } = await generarAllowlist(modelo);
    const todas = Object.entries(entidades).flatMap(([entidad, { campos }]) =>
      campos.map((campo) => `${entidad}.${campo}`),
    );

    for (const excluida of ['source_span', 'reviewed_by', 'recorded_by']) {
      expect(todas.filter((campo) => campo.endsWith(`.${excluida}`)), excluida).toEqual([]);
    }
    expect(todas.filter((campo) => campo.endsWith('_id'))).toEqual([]);
    expect(entidades['ClinicalEvent'].campos).not.toContain('description');
    expect(todas).not.toContain('Exam.patient_id');
  });

  it('conserva los campos que usa el contenido del S3 como destino [US-001 AC-7]', async () => {
    const { entidades } = await generarAllowlist(modelo);

    expect(entidades['Diagnosis'].campos).toEqual(
      expect.arrayContaining(['histology', 'grade', 'stage_value', 'performance_value']),
    );
    expect(entidades['Biomarker'].campos).toEqual(expect.arrayContaining(['name', 'value']));
    expect(entidades['Exam'].campos).toContain('exam_type');
    expect(entidades['ClinicalAttribute'].campos).toEqual(
      expect.arrayContaining(['attribute_key', 'value']),
    );
  });

  it('pierde performance_value cuando el modelo de test elimina el campo [US-001 AC-4]', async () => {
    const sinCampo = modelo.replace(/^\s*performanceValue\s.*$/m, '');

    const { entidades } = await generarAllowlist(sinCampo);

    expect(entidades['Diagnosis'].campos).not.toContain('performance_value');
  });

  it('falla la generación cuando una entidad de la lista desaparece del modelo', async () => {
    const sinEntidad = modelo.replace('model ClinicalEvent {', 'model ClinicalEventRenombrado {');

    await expect(generarAllowlist(sinEntidad)).rejects.toThrow('ClinicalEvent');
  });
});
