"""La suite de evaluación no abre conexiones fuera de loopback (RN-12, ADR-41 D6)."""

from __future__ import annotations

import socket

import pytest

from tests.evaluation.red_solo_loopback import RedSoloLoopback

TIEMPO_MAXIMO_S = 2.0
DESTINO_NO_ENRUTABLE = (".".join(("203", "0", "113", "1")), 9)  # TEST-NET-3 (RFC 5737): no enruta


@pytest.mark.parametrize("metodo", ["connect", "connect_ex"])
def test_un_intento_de_conexion_fuera_de_loopback_se_rechaza_y_queda_registrado(
    red: RedSoloLoopback, metodo: str
) -> None:
    with socket.socket() as cliente:
        cliente.settimeout(TIEMPO_MAXIMO_S)
        with pytest.raises(OSError, match="red bloqueada"):
            getattr(cliente, metodo)(DESTINO_NO_ENRUTABLE)

    assert red.intentos == [f"socket.{metodo}"]
    red.intentos.clear()  # el intento era el objeto del test; el fixture autouse no debe fallarlo


def test_resolver_un_nombre_de_nube_se_rechaza_y_queda_registrado(red: RedSoloLoopback) -> None:
    with pytest.raises(OSError, match="red bloqueada"):
        socket.getaddrinfo("api.nube-de-prueba.invalid", 443)

    assert red.intentos == ["socket.getaddrinfo"]
    red.intentos.clear()


@pytest.mark.parametrize("resolver", ["gethostbyname", "gethostbyname_ex"])
def test_resolver_con_gethostbyname_un_nombre_de_nube_se_rechaza(
    red: RedSoloLoopback, resolver: str
) -> None:
    with pytest.raises(OSError, match="red bloqueada"):
        getattr(socket, resolver)("api.nube-de-prueba.invalid")

    assert red.intentos == [f"socket.{resolver}"]
    red.intentos.clear()


@pytest.mark.parametrize("envio", ["sendto", "sendmsg"])
def test_un_datagrama_a_un_destino_fuera_de_loopback_se_rechaza_antes_de_salir(
    red: RedSoloLoopback, envio: str
) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as cliente:
        cliente.settimeout(TIEMPO_MAXIMO_S)
        argumentos = (
            (b"x", DESTINO_NO_ENRUTABLE)
            if envio == "sendto"
            else ([b"x"], [], 0, DESTINO_NO_ENRUTABLE)
        )
        with pytest.raises(OSError, match="red bloqueada"):
            getattr(cliente, envio)(*argumentos)

    assert red.intentos == [f"socket.{envio}"]
    red.intentos.clear()


def test_una_conexion_a_loopback_con_puerto_efimero_y_tiempo_maximo_funciona(
    red: RedSoloLoopback,
) -> None:
    with socket.socket() as servidor:
        servidor.bind(("127.0.0.1", 0))
        servidor.listen(1)
        servidor.settimeout(TIEMPO_MAXIMO_S)
        with socket.create_connection(servidor.getsockname(), timeout=TIEMPO_MAXIMO_S) as cliente:
            aceptado, _ = servidor.accept()
            aceptado.close()
            assert cliente.getpeername() == servidor.getsockname()

    assert red.intentos == []
