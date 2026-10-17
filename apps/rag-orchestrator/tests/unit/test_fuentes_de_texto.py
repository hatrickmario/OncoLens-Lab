"""Origen del texto de la semilla: archivo junto al manifiesto o URL de un host permitido (US-059 D9, RN-14)."""

from __future__ import annotations

import inspect
from pathlib import Path

import httpx
import pytest
import respx

from app.infrastructure.fetch import descargador_https, fuente_de_texto
from app.infrastructure.fetch.descargador_https import (
    DescargadorHttps,
    FuenteNoDisponible,
    FuenteNoPermitida,
)
from app.infrastructure.fetch.fuente_de_texto import (
    FuenteDeTextoDelManifiesto,
    RutaFueraDelManifiesto,
)
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras
from tests.support.semilla import documento_de_prueba

URL = "https://www.cancer.gov/types/breast/hp/breast-treatment-pdq.txt"


def descargador(max_bytes: int = 1000) -> DescargadorHttps:
    return DescargadorHttps(httpx.Client(), ["www.cancer.gov"], max_bytes)


@respx.mock
def test_descarga_el_texto_de_un_host_permitido_por_https() -> None:
    respx.get(URL).respond(
        200, text="Texto público.", headers={"content-type": "text/plain; charset=utf-8"}
    )

    assert descargador().descargar_texto(URL) == "Texto público."


@pytest.mark.parametrize(
    "url", ["http://www.cancer.gov/a.txt", "https://evil.example/a.txt", "ftp://www.cancer.gov/a"]
)
@respx.mock
def test_no_sale_a_otro_host_ni_por_http_y_no_llega_a_pedir_nada(url: str) -> None:
    ruta = respx.route().respond(200, text="x")

    with pytest.raises(FuenteNoPermitida):
        descargador().descargar_texto(url)

    assert not ruta.called


@pytest.mark.parametrize(
    "url",
    [
        "https://www.cancer.gov:8443/a.txt",
        "https://www.cancer.gov:80/a.txt",
        "https://usuario" + "@www.cancer.gov/a.txt",
        "https://usuario:clave" + "@www.cancer.gov/a.txt",
        "https://www.cancer.gov" + "@evil.example/a.txt",
    ],
)
@respx.mock
def test_solo_el_puerto_443_o_ninguno_y_sin_credenciales_en_la_url(url: str) -> None:
    ruta = respx.route().respond(200, text="x", headers={"content-type": "text/plain"})

    with pytest.raises(FuenteNoPermitida):
        descargador().descargar_texto(url)

    assert not ruta.called


@respx.mock
def test_el_puerto_443_explicito_se_acepta() -> None:
    respx.get("https://www.cancer.gov:443/a.txt").respond(
        200, text="Texto.", headers={"content-type": "text/plain"}
    )

    assert descargador().descargar_texto("https://www.cancer.gov:443/a.txt") == "Texto."


@pytest.mark.parametrize("tipo", ["text/plainx", "text/plain-evil", "application/text/plain", ""])
@respx.mock
def test_el_tipo_de_medio_debe_ser_exactamente_text_plain(tipo: str) -> None:
    respx.get(URL).respond(200, text="x", headers={"content-type": tipo})

    with pytest.raises(FuenteNoDisponible, match="text/plain"):
        descargador().descargar_texto(URL)


@pytest.mark.parametrize(
    "tipo", ["text/plain", "TEXT/PLAIN; charset=utf-8", " text/plain ;charset=UTF-8"]
)
@respx.mock
def test_text_plain_con_parametros_o_mayusculas_se_acepta(tipo: str) -> None:
    respx.get(URL).respond(200, text="Texto.", headers={"content-type": tipo})

    assert descargador().descargar_texto(URL) == "Texto."


class RelojQueAvanza:
    """Reloj monotónico falso: cada lectura avanza ``paso`` segundos."""

    def __init__(self, paso: float) -> None:
        self.paso, self.ahora = paso, 0.0

    def __call__(self) -> float:
        self.ahora += self.paso
        return self.ahora


@respx.mock
def test_un_cuerpo_que_llega_a_cuentagotas_excede_el_plazo_total_aunque_cada_bloque_llegue_a_tiempo() -> (
    None
):
    respx.get(URL).respond(200, content=b"x" * 50, headers={"content-type": "text/plain"})
    lento = DescargadorHttps(
        httpx.Client(),
        ["www.cancer.gov"],
        1000,
        deadline_s=10.0,
        reloj_monotonico=RelojQueAvanza(6.0),
    )

    with pytest.raises(FuenteNoDisponible, match="plazo"):
        lento.descargar_texto(URL)


@respx.mock
def test_dentro_del_plazo_total_la_descarga_termina() -> None:
    respx.get(URL).respond(200, text="Texto.", headers={"content-type": "text/plain"})
    rapido = DescargadorHttps(
        httpx.Client(),
        ["www.cancer.gov"],
        1000,
        deadline_s=10.0,
        reloj_monotonico=RelojQueAvanza(0.1),
    )

    assert rapido.descargar_texto(URL) == "Texto."


@respx.mock
def test_no_sigue_redirecciones_que_saltarian_la_lista_de_hosts() -> None:
    respx.get(URL).respond(302, headers={"location": "https://evil.example/a.txt"})
    destino = respx.get("https://evil.example/a.txt").respond(200, text="x")

    with pytest.raises(FuenteNoDisponible, match="HTTP 302"):
        descargador().descargar_texto(URL)

    assert not destino.called


@pytest.mark.parametrize(
    ("respuesta", "mensaje"),
    [
        (httpx.Response(503), "HTTP 503"),
        (httpx.Response(200, text="<html/>", headers={"content-type": "text/html"}), "text/plain"),
        (
            httpx.Response(200, text="x" * 2000, headers={"content-type": "text/plain"}),
            "supera 1000",
        ),
    ],
)
@respx.mock
def test_un_error_un_tipo_ajeno_o_un_cuerpo_enorme_no_son_un_texto(
    respuesta: httpx.Response, mensaje: str
) -> None:
    respx.get(URL).mock(return_value=respuesta)

    with pytest.raises(FuenteNoDisponible, match=mensaje):
        descargador().descargar_texto(URL)


@respx.mock
def test_el_error_de_red_nombra_el_host_y_no_la_url_completa() -> None:
    respx.get(URL).mock(side_effect=httpx.ConnectTimeout("tiempo agotado en /types/breast"))

    with pytest.raises(FuenteNoDisponible) as error:
        descargador().descargar_texto(URL)

    assert "www.cancer.gov" in str(error.value) and "/types/breast" not in str(error.value)


def test_el_texto_inline_se_entrega_tal_cual(tmp_path: Path) -> None:
    fuente = FuenteDeTextoDelManifiesto(tmp_path, None)

    assert fuente.obtener_texto(documento_de_prueba(texto="Texto sintético.")) == "Texto sintético."


def test_el_archivo_se_lee_relativo_al_directorio_del_manifiesto(tmp_path: Path) -> None:
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "d-1.txt").write_text("Del archivo.", encoding="utf-8")
    fuente = FuenteDeTextoDelManifiesto(tmp_path, None)

    assert (
        fuente.obtener_texto(documento_de_prueba(texto=None, ruta_texto="docs/d-1.txt"))
        == "Del archivo."
    )


@pytest.mark.parametrize("ruta", ["../secreto.txt", "/etc/passwd", "docs/../../secreto.txt"])
def test_una_ruta_que_sale_del_directorio_del_manifiesto_se_rechaza_sin_leerla(
    tmp_path: Path, ruta: str
) -> None:
    (tmp_path.parent / "secreto.txt").write_text("no debe leerse", encoding="utf-8")
    fuente = FuenteDeTextoDelManifiesto(tmp_path / "base", None)

    with pytest.raises(RutaFueraDelManifiesto):
        fuente.obtener_texto(documento_de_prueba(texto=None, ruta_texto=ruta))


@respx.mock
def test_la_url_se_descarga_con_el_descargador_de_hosts_permitidos(tmp_path: Path) -> None:
    respx.get(URL).respond(200, text="Remoto.", headers={"content-type": "text/plain"})
    fuente = FuenteDeTextoDelManifiesto(tmp_path, descargador())

    assert fuente.obtener_texto(documento_de_prueba(texto=None, url_fuente=URL)) == "Remoto."


def test_una_url_sin_descargador_configurado_falla_en_lugar_de_salir_a_la_red(
    tmp_path: Path,
) -> None:
    with pytest.raises(RuntimeError, match="d-1"):
        FuenteDeTextoDelManifiesto(tmp_path, None).obtener_texto(
            documento_de_prueba(texto=None, url_fuente=URL)
        )


def test_la_unica_clase_de_fetch_que_implementa_source_fetcher_es_la_fuente_de_texto_del_manifiesto() -> (
    None
):
    """``DescargadorHttps`` baja una URL; solo ``FuenteDeTextoDelManifiesto`` entrega el texto de un documento."""
    implementan = [
        clase.__name__
        for modulo in (fuente_de_texto, descargador_https)
        for _, clase in inspect.getmembers(modulo, inspect.isclass)
        if clase.__module__ == modulo.__name__ and hasattr(clase, "obtener_texto")
    ]

    assert implementan == ["FuenteDeTextoDelManifiesto"]


def test_el_tokenizador_por_palabras_conserva_el_texto_al_concatenar_sus_piezas() -> None:
    texto = "Primera  frase.\n\nSegunda frase con\ttabulador."

    piezas = TokenizadorPorPalabras().tokenizar(texto)

    assert "".join(piezas) == texto and len(piezas) == 6
