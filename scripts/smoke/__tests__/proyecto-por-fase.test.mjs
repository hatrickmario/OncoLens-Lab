import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SMOKE = readFileSync(resolve(import.meta.dirname, '../compose-smoke.sh'), 'utf8');
const trozo = (desde, hasta) => SMOKE.slice(SMOKE.indexOf(desde), SMOKE.indexOf(hasta));

describe('compose-smoke.sh · proyecto de Compose por fase [D4-18]', () => {
  it('arranca la fase 1 en un proyecto distinto del de la fase 2 para no chocar por nombre de contenedor', () => {
    const fase1 = trozo('# ---------- fase 1', '# ---------- secretos de las fases siguientes');

    expect(fase1).toContain('proyecto="$proyecto_fase1"');
    expect(fase1).toMatch(/proyecto="\$proyecto_base"\n/);
    expect(SMOKE).toContain('proyecto_fase1="$proyecto_base-f1"');
  });

  it('registra la salida del down de la fase 1 en lugar de descartarla', () => {
    const fase1 = trozo('# ---------- fase 1', '# ---------- secretos de las fases siguientes');

    expect(fase1).not.toMatch(/down[^\n]*>\/dev\/null/);
    expect(fase1).toMatch(/down -v --remove-orphans >>"\$log" 2>&1/);
  });

  it('baja todos los proyectos usados en el trap de limpieza', () => {
    const limpieza = trozo('limpiar() {', 'trap limpiar EXIT');

    expect(limpieza).toContain('for p in "${proyectos[@]}"');
    expect(limpieza).toContain('down -v --remove-orphans');
  });

  it('vuelca el log completo y compose ps -a cuando falla', () => {
    const fallo = trozo('fallo() {', 'bien() {');

    expect(fallo).toContain('cat "$log"');
    expect(fallo).not.toContain('tail -n 20');
    expect(fallo).toContain('compose ps -a');
  });
});
