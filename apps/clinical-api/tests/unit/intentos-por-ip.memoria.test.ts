import { describe, expect, it } from 'vitest';
import { createRegistroDeIntentosPorIp } from '../../src/infrastructure/intentos-por-ip.memoria.js';
import type { RegistroDeIntentosPorIp } from '../../src/modules/auth/auth.service.js';
import { relojAjustable } from '../support/usuarios.js';

const IP = '198.51.100.7';

function registroDeTest() {
  const reloj = relojAjustable();
  const registro = createRegistroDeIntentosPorIp({ reloj, maxIntentos: 3, ventanaMinutos: 15 });
  return { reloj, registro };
}

/** Un intento fallido: se reserva y la reserva no se libera. */
function fallar(registro: RegistroDeIntentosPorIp, ip: string): void {
  registro.reservar(ip);
}

/** Consulta sin dejar rastro: reserva y, si la obtuvo, la libera enseguida. */
function estaBloqueada(registro: RegistroDeIntentosPorIp, ip: string): boolean {
  const reserva = registro.reservar(ip);
  reserva?.liberar();
  return reserva === null;
}

describe('RegistroDeIntentosPorIp en memoria', () => {
  it('concede la reserva a una IP sin intentos', () => {
    const { registro } = registroDeTest();

    expect(registro.reservar(IP)).not.toBeNull();
  });

  it('no bloquea mientras los intentos no alcanzan el máximo', () => {
    const { registro } = registroDeTest();

    fallar(registro, IP);
    fallar(registro, IP);

    expect(estaBloqueada(registro, IP)).toBe(false);
  });

  it('bloquea al alcanzar el máximo de intentos dentro de la ventana', () => {
    const { registro } = registroDeTest();

    for (let i = 0; i < 3; i += 1) fallar(registro, IP);

    expect(estaBloqueada(registro, IP)).toBe(true);
  });

  it('cuenta los intentos en curso: reservas sin resolver agotan el máximo antes de verificar ninguna', () => {
    const { registro } = registroDeTest();

    const reservas = Array.from({ length: 20 }, () => registro.reservar(IP));

    expect(reservas.filter((reserva) => reserva !== null)).toHaveLength(3);
  });

  it('devuelve el cupo cuando se libera la reserva de un intento correcto', () => {
    const { registro } = registroDeTest();
    const reservas = Array.from({ length: 3 }, () => registro.reservar(IP));
    expect(estaBloqueada(registro, IP)).toBe(true);

    reservas[0]?.liberar();

    expect(estaBloqueada(registro, IP)).toBe(false);
  });

  it('no mezcla los intentos de IP distintas', () => {
    const { registro } = registroDeTest();
    fallar(registro, IP);
    fallar(registro, IP);

    fallar(registro, '203.0.113.9');

    expect(estaBloqueada(registro, IP)).toBe(false);
    expect(estaBloqueada(registro, '203.0.113.9')).toBe(false);
  });

  it('sigue bloqueada un instante antes de cumplirse la ventana y se libera al cumplirse exactamente', () => {
    const { reloj, registro } = registroDeTest();
    for (let i = 0; i < 3; i += 1) fallar(registro, IP);

    reloj.avanzarMinutos(14);
    expect(estaBloqueada(registro, IP)).toBe(true);
    reloj.avanzarMinutos(1);
    expect(estaBloqueada(registro, IP)).toBe(false);
  });

  it('desliza la ventana: los intentos más viejos dejan de contar y los nuevos vuelven a bloquear', () => {
    const { reloj, registro } = registroDeTest();
    fallar(registro, IP);
    reloj.avanzarMinutos(10);
    fallar(registro, IP);
    fallar(registro, IP);
    expect(estaBloqueada(registro, IP)).toBe(true);

    reloj.avanzarMinutos(5);
    expect(estaBloqueada(registro, IP)).toBe(false);
    fallar(registro, IP);
    expect(estaBloqueada(registro, IP)).toBe(true);
  });

  it('trata la forma IPv4 y la forma IPv4 mapeada a IPv6 como la misma IP', () => {
    const { registro } = registroDeTest();
    fallar(registro, IP);
    fallar(registro, `::ffff:${IP}`);
    fallar(registro, IP);

    expect(estaBloqueada(registro, `::FFFF:${IP}`)).toBe(true);
  });

  it('descarta las IP con todos sus intentos vencidos cuando pasa una ventana completa', () => {
    const { reloj, registro } = registroDeTest();
    fallar(registro, IP);
    fallar(registro, '203.0.113.9');
    expect(registro.ipsRegistradas()).toBe(2);

    reloj.avanzarMinutos(16);
    fallar(registro, '192.0.2.1');

    expect(registro.ipsRegistradas()).toBe(1);
  });

  it('olvida la IP cuando se libera su única reserva', () => {
    const { registro } = registroDeTest();

    registro.reservar(IP)?.liberar();

    expect(registro.ipsRegistradas()).toBe(0);
  });
});
