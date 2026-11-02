import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  historiasDelTitulo,
  main,
  tareasSinDestino,
  tasksDeLasHistorias,
} from '../tasks-destino.mjs';

describe('historiasDelTitulo', () => {
  it('lee todos los L1D-nn de los corchetes iniciales del título', () => {
    expect(historiasDelTitulo('[L1D-145][L1D-300] Llevar a main')).toEqual(['L1D-145', 'L1D-300']);
  });

  it('devuelve vacío cuando el título no es de una historia', () => {
    expect(historiasDelTitulo('[S4] Cierre: archivo')).toEqual([]);
    expect(historiasDelTitulo('docs: menciona [L1D-144] al final')).toEqual([]);
  });
});

describe('tareasSinDestino', () => {
  it('no marca las tareas cumplidas', () => {
    expect(tareasSinDestino('- [x] 1.1 hecho\n- [x] 1.2 hecho', ['L1D-144'])).toEqual([]);
  });

  it('marca una tarea abierta sin traslado', () => {
    const r = tareasSinDestino('- [x] 1.1 hecho\n- [ ] 1.2 pendiente', ['L1D-144']);

    expect(r.map((t) => t.numero)).toEqual([2]);
  });

  it('acepta DIFERIDA con un ID de deuda', () => {
    expect(
      tareasSinDestino('- [ ] 2.3 DIFERIDA -> D4-37 (S5): E2E contra Compose', ['L1D-145']),
    ).toEqual([]);
  });

  it('acepta TRASLADADA con una historia o una tarea humana', () => {
    expect(tareasSinDestino('- [ ] 1.1 TRASLADADA a L1D-297 tarea 2.10', ['L1D-131'])).toEqual([]);
    expect(tareasSinDestino('- [ ] 3.3 DIFERIDA -> H-2 (tarea humana)', ['L1D-144'])).toEqual([]);
  });

  it('rechaza una tarea trasladada «a deuda del S5» sin ID, como las de L1D-144 y L1D-245 en el S4', () => {
    expect(
      tareasSinDestino('- [ ] 4.1 (NO MARCADA: TRASLADADA a deuda del S5) Refactor', ['L1D-144']),
    ).toHaveLength(1);
  });

  it('el ID de la propia historia no vale como destino', () => {
    expect(
      tareasSinDestino('- [ ] 4.1 TRASLADADA al S5 · commit `refactor(L1D-144)`', ['L1D-144']),
    ).toHaveLength(1);
  });

  it('un ID sin la palabra de traslado tampoco vale', () => {
    expect(tareasSinDestino('- [ ] 4.1 pendiente, ver D4-37', ['L1D-145'])).toHaveLength(1);
  });

  it('acepta una entrega posterior de la misma historia', () => {
    expect(tareasSinDestino('- [ ] 2.1 DIFERIDA -> entrega 2 de L1D-97', ['L1D-97'])).toEqual([]);
  });
});

describe('main sobre un árbol de changes', () => {
  function arbol(tasksPorChange) {
    const raiz = mkdtempSync(path.join(os.tmpdir(), 'oncolens-tasks-destino-'));
    for (const [change, texto] of Object.entries(tasksPorChange)) {
      mkdirSync(path.join(raiz, 'openspec', 'changes', change), { recursive: true });
      writeFileSync(path.join(raiz, 'openspec', 'changes', change, 'tasks.md'), texto);
    }
    return raiz;
  }

  it('devuelve 0 y no mira nada cuando el título no es de historia', () => {
    const raiz = arbol({ 'l1d-144-x': '- [ ] 1.1 pendiente' });

    expect(main({ titulo: '[S4] Cierre', raiz })).toBe(0);
  });

  it('devuelve 1 cuando el change de la historia tiene una tarea abierta sin destino', () => {
    const raiz = arbol({ 'l1d-144-x': '- [ ] 1.1 pendiente', 'l1d-145-y': '- [ ] 1.1 pendiente' });

    expect(main({ titulo: '[L1D-144] Hasta 3 opciones', raiz })).toBe(1);
  });

  it('devuelve 0 cuando las abiertas llevan destino, e ignora los changes de otras historias', () => {
    const raiz = arbol({
      'l1d-144-x': '- [x] 1.1 hecho\n- [ ] 2.1 DIFERIDA -> D4-39',
      'l1d-145-y': '- [ ] 1.1 pendiente',
    });

    expect(main({ titulo: '[L1D-144] Hasta 3 opciones', raiz })).toBe(0);
  });

  it('no mira la carpeta archive', () => {
    const raiz = arbol({ 'archive/2026-11-02-l1d-144-x': '- [ ] 1.1 pendiente' });

    expect(tasksDeLasHistorias(raiz, ['L1D-144'])).toEqual([]);
  });
});
