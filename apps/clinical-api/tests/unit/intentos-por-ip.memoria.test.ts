import { describe, expect, it } from 'vitest';
import { createRegistroDeIntentosPorIp } from '../../src/infrastructure/intentos-por-ip.memoria.js';
import { relojAjustable } from '../support/usuarios.js';

const IP = '198.51.100.7';

function registroDeTest() {
  const reloj = relojAjustable();
  const registro = createRegistroDeIntentosPorIp({ reloj, maxIntentos: 3, ventanaMinutos: 15 });
  return { reloj, registro };
}

describe('RegistroDeIntentosPorIp en memoria', () => {
  it('no bloquea una IP sin fallos', () => {
    const { registro } = registroDeTest();

    expect(registro.estaBloqueada(IP)).toBe(false);
  });

  it('no bloquea mientras los fallos no alcanzan el máximo', () => {
    const { registro } = registroDeTest();

    registro.registrarFallo(IP);
    registro.registrarFallo(IP);

    expect(registro.estaBloqueada(IP)).toBe(false);
  });

  it('bloquea al alcanzar el máximo de fallos dentro de la ventana', () => {
    const { registro } = registroDeTest();

    for (let i = 0; i < 3; i += 1) registro.registrarFallo(IP);

    expect(registro.estaBloqueada(IP)).toBe(true);
  });

  it('no mezcla los fallos de IP distintas', () => {
    const { registro } = registroDeTest();
    registro.registrarFallo(IP);
    registro.registrarFallo(IP);

    registro.registrarFallo('203.0.113.9');

    expect(registro.estaBloqueada(IP)).toBe(false);
    expect(registro.estaBloqueada('203.0.113.9')).toBe(false);
  });

  it('sigue bloqueada un instante antes de cumplirse la ventana y se libera al cumplirse exactamente', () => {
    const { reloj, registro } = registroDeTest();
    for (let i = 0; i < 3; i += 1) registro.registrarFallo(IP);

    reloj.avanzarMinutos(14);
    expect(registro.estaBloqueada(IP)).toBe(true);
    reloj.avanzarMinutos(1);
    expect(registro.estaBloqueada(IP)).toBe(false);
  });

  it('desliza la ventana: los fallos más viejos dejan de contar y los nuevos vuelven a bloquear', () => {
    const { reloj, registro } = registroDeTest();
    registro.registrarFallo(IP);
    reloj.avanzarMinutos(10);
    registro.registrarFallo(IP);
    registro.registrarFallo(IP);
    expect(registro.estaBloqueada(IP)).toBe(true);

    reloj.avanzarMinutos(5);
    expect(registro.estaBloqueada(IP)).toBe(false);
    registro.registrarFallo(IP);
    expect(registro.estaBloqueada(IP)).toBe(true);
  });

  it('trata la forma IPv4 y la forma IPv4 mapeada a IPv6 como la misma IP', () => {
    const { registro } = registroDeTest();
    registro.registrarFallo(IP);
    registro.registrarFallo(`::ffff:${IP}`);
    registro.registrarFallo(IP);

    expect(registro.estaBloqueada(`::FFFF:${IP}`)).toBe(true);
  });

  it('descarta las IP con todos sus fallos vencidos cuando pasa una ventana completa', () => {
    const { reloj, registro } = registroDeTest();
    registro.registrarFallo(IP);
    registro.registrarFallo('203.0.113.9');
    expect(registro.ipsRegistradas()).toBe(2);

    reloj.avanzarMinutos(16);
    registro.registrarFallo('192.0.2.1');

    expect(registro.ipsRegistradas()).toBe(1);
  });
});
