"""Reglas puras de la medicion de ADR-40 (US-013 AC-1): sensibilidad, falsos positivos y eleccion del mas simple."""

from __future__ import annotations

from app.scripts.adr40.reglas import (
    TOTAL,
    Control,
    Medicion,
    Span,
    elegir_mas_simple_que_cumple,
    esta_cubierta,
    falsos_positivos_clinicos,
    sensibilidad_por_tipo,
)

REMUESTREOS, SEMILLA = 200, 7


def _sens(resultados):  # type: ignore[no-untyped-def]
    return sensibilidad_por_tipo(resultados, 0.5, REMUESTREOS, SEMILLA)


class TestSensibilidadPorTipo:
    def test_cuenta_como_acierto_el_span_cubierto_al_menos_en_la_fraccion_minima(self) -> None:
        etiqueta = Span(0, 10, "nombre")

        assert esta_cubierta(etiqueta, [Span(0, 5, "nombre")], 0.5)
        assert not esta_cubierta(etiqueta, [Span(0, 4, "nombre")], 0.5)

    def test_el_tipo_del_hallazgo_no_importa_porque_lo_que_cuenta_es_enmascarar(self) -> None:
        assert esta_cubierta(Span(0, 10, "documento"), [Span(0, 10, "telefono")], 0.5)

    def test_calcula_la_sensibilidad_de_cada_tipo_y_el_total(self) -> None:
        resultados = [
            ([Span(0, 4, "nombre"), Span(10, 20, "telefono")], [Span(0, 4, "nombre")]),
            ([Span(0, 4, "nombre")], [Span(0, 4, "nombre")]),
        ]

        medidas = _sens(resultados)

        assert medidas["nombre"].valor == 1.0 and medidas["nombre"].total == 2
        assert medidas["telefono"].valor == 0.0
        assert medidas[TOTAL].valor == 2 / 3

    def test_un_acierto_perfecto_tiene_intervalo_degenerado_y_uno_mixto_lo_tiene_ancho(
        self,
    ) -> None:
        todos = [([Span(0, 4, "nombre")], [Span(0, 4, "nombre")])] * 20
        mixto = todos[:10] + [([Span(0, 4, "nombre")], [])] * 10

        assert _sens(todos)["nombre"].ic95 == (1.0, 1.0)
        bajo, alto = _sens(mixto)["nombre"].ic95  # type: ignore[misc]
        assert bajo < 0.5 < alto

    def test_un_tipo_sin_etiquetas_no_aparece_en_vez_de_valer_cero(self) -> None:
        medidas = _sens([([Span(0, 4, "nombre")], [])])

        assert "telefono" not in medidas

    def test_sin_ninguna_etiqueta_el_total_queda_sin_medir_y_no_en_cero(self) -> None:
        medidas = _sens([([], [Span(0, 3, "nombre")])])

        assert medidas[TOTAL].valor is None and medidas[TOTAL].ic95 is None


class TestFalsosPositivosClinicos:
    def test_cuenta_los_terminos_clinicos_tocados_por_un_hallazgo_y_separa_los_criticos(
        self,
    ) -> None:
        controles = [Control("HER2", 0, 4, True), Control("tamoxifeno", 10, 20, False)]

        fp = falsos_positivos_clinicos(
            [(controles, [Span(2, 6, "nombre"), Span(30, 40, "nombre")])]
        )

        assert fp.controles == 2 and fp.marcados == 1 and fp.tasa == 0.5
        assert dict(fp.criticos_marcados) == {"HER2": 1}

    def test_sin_controles_la_tasa_queda_sin_medir(self) -> None:
        assert falsos_positivos_clinicos([([], [])]).tasa is None


class TestEleccion:
    TIPOS = ["nombre", "documento"]

    def test_descarta_al_candidato_con_algun_tipo_por_debajo_del_minimo(self) -> None:
        simple = Medicion("1", {"nombre": 0.0, "documento": 1.0})

        decision = elegir_mas_simple_que_cumple([simple], 0.95, self.TIPOS)

        assert decision.elegido is None
        assert decision.descartes[0][0] == "1" and "nombre" in decision.descartes[0][1]

    def test_elige_el_mas_simple_cuando_varios_cumplen(self) -> None:
        mediciones = [
            Medicion("1", {"nombre": 0.96, "documento": 1.0}),
            Medicion("2", {"nombre": 1.0, "documento": 1.0}),
        ]

        assert elegir_mas_simple_que_cumple(mediciones, 0.95, self.TIPOS).elegido == "1"

    def test_pasa_al_siguiente_cuando_el_mas_simple_no_cumple(self) -> None:
        mediciones = [
            Medicion("1", {"nombre": 0.2, "documento": 1.0}),
            Medicion("2", {"nombre": 0.97, "documento": 1.0}),
        ]

        decision = elegir_mas_simple_que_cumple(mediciones, 0.95, self.TIPOS)

        assert decision.elegido == "2" and [c for c, _ in decision.descartes] == ["1"]

    def test_un_tipo_sin_medir_descarta_en_vez_de_contar_como_cumplido(self) -> None:
        decision = elegir_mas_simple_que_cumple(
            [Medicion("1", {"nombre": None, "documento": 1.0})], 0.95, self.TIPOS
        )

        assert decision.elegido is None and "sin medir" in decision.descartes[0][1]

    def test_descarta_al_candidato_cuya_memoria_no_cabe_en_el_margen(self) -> None:
        pesado = Medicion("2", {"nombre": 1.0, "documento": 1.0}, memoria_mb=900.0)

        decision = elegir_mas_simple_que_cumple([pesado], 0.95, self.TIPOS, memoria_maxima_mb=727.0)

        assert decision.elegido is None and "memoria" in decision.descartes[0][1]

    def test_un_candidato_de_referencia_que_cumple_no_se_elige(self) -> None:
        referencia = Medicion("1-base", {"nombre": 1.0, "documento": 1.0}, elegible=False)
        propuesto = Medicion("1", {"nombre": 1.0, "documento": 1.0})

        assert (
            elegir_mas_simple_que_cumple([referencia, propuesto], 0.95, self.TIPOS).elegido == "1"
        )
