"""Detectores y CLI de la medicion de ADR-40 (US-013 AC-1) con un NER falso en el borde del modelo."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.scripts.adr40.cli import (
    FORMATOS_B2,
    SALIDA_DATASET,
    SALIDA_NINGUNO_CUMPLE,
    SALIDA_OK,
    SALIDA_SIN_NER,
    main,
)
from app.scripts.adr40.dataset import cargar_corpus
from app.scripts.adr40.detectores import DetectorConNer, DetectorDePatrones, cargar_formatos
from tests.evaluation.conftest import RAIZ_REPO

FECHA = datetime(2026, 10, 21, 12, 0, tzinfo=UTC)
FORMATOS_REPO = RAIZ_REPO / "config" / "pii-formats.json"


def _patrones() -> DetectorDePatrones:
    return DetectorDePatrones(cargar_formatos([FORMATOS_REPO, FORMATOS_B2]))


class _NerFalso:
    """Reconoce como PER exactamente los nombres que le pasan (el modelo real es un borde)."""

    def __init__(self, nombres: set[str], etiqueta: str = "PER") -> None:
        self._nombres, self._etiqueta = nombres, etiqueta

    def __call__(self, texto: str) -> Any:
        ents = []
        for nombre in self._nombres:
            inicio = texto.find(nombre)
            if inicio >= 0:
                ents.append(
                    SimpleNamespace(
                        start_char=inicio, end_char=inicio + len(nombre), label_=self._etiqueta
                    )
                )
        return SimpleNamespace(ents=ents)


def _nombres_sembrados() -> set[str]:
    return {
        t.texto[e.inicio : e.fin]
        for t in cargar_corpus()
        for e in t.etiquetas
        if e.tipo == "nombre"
    }


def _ejecutar(tmp_path: Path, cargador, *extra: str) -> tuple[int, dict[str, Any]]:  # type: ignore[no-untyped-def]
    from app.scripts.adr40 import cli

    argumentos = cli._parser().parse_args(
        ["--out", str(tmp_path), "--corridas", "1", "--remuestreos", "50", *extra]
    )
    codigo = cli.ejecutar(argumentos, cargar_corpus(), lambda: FECHA, RAIZ_REPO, cargador)
    return codigo, json.loads((tmp_path / "medicion.json").read_text(encoding="utf-8"))


class TestDetectorDePatrones:
    def test_detecta_un_correo_de_example_test_porque_enmascarar_no_hereda_las_exenciones_del_escaner(
        self,
    ) -> None:
        hallazgos = _patrones().detectar("Contacto: ana.1234@example.test")

        assert [h.tipo for h in hallazgos] == ["correo"]

    def test_detecta_documento_con_letra_telefono_con_espacios_y_fecha_en_letras(self) -> None:
        texto = "DNI 12345678Z, +34 612 345 678, nacido el 4 de marzo de 1950"

        tipos = sorted(h.tipo for h in _patrones().detectar(texto))

        assert tipos == ["documento_identidad", "fecha_nacimiento", "telefono"]

    def test_no_marca_un_termino_clinico_con_cifras(self) -> None:
        assert (
            _patrones().detectar("PSA 12,4 ng/mL, Ki-67 20 %, CA 15-3 de 28 U/mL, pT2 pN0 M0") == []
        )


class TestDetectorConNer:
    def test_suma_las_entidades_de_persona_a_los_patrones(self) -> None:
        detector = DetectorConNer(_patrones(), _NerFalso({"Ana Pérez"}))

        assert {
            h.tipo for h in detector.detectar("Paciente Ana Pérez, celular " + "555 " + "0142")
        } == {
            "nombre",
            "telefono",
        }

    def test_ignora_las_etiquetas_que_no_son_pii_directa(self) -> None:
        detector = DetectorConNer(_patrones(), _NerFalso({"Roche"}, etiqueta="ORG"))

        assert detector.detectar("fabricante Roche") == []


class TestCli:
    @pytest.mark.ac("US-013", 1)
    def test_elige_el_candidato_2_cuando_el_ner_completa_la_sensibilidad_de_nombres(
        self, tmp_path: Path
    ) -> None:
        codigo, reporte = _ejecutar(tmp_path, lambda m, v: (_NerFalso(_nombres_sembrados()), 100.0))

        assert codigo == SALIDA_OK
        assert reporte["decision"]["elegido"] == "2"
        assert [d["candidato"] for d in reporte["decision"]["descartes"]] == ["1-base", "1"]

    def test_declara_que_ninguno_cumple_y_no_elige_cuando_el_ner_no_reconoce_nombres(
        self, tmp_path: Path
    ) -> None:
        codigo, reporte = _ejecutar(tmp_path, lambda m, v: (_NerFalso(set()), 100.0))

        assert codigo == SALIDA_NINGUNO_CUMPLE
        assert reporte["decision"]["elegido"] is None

    def test_descarta_al_candidato_2_cuando_su_memoria_excede_el_margen(
        self, tmp_path: Path
    ) -> None:
        codigo, reporte = _ejecutar(tmp_path, lambda m, v: (_NerFalso(_nombres_sembrados()), 900.0))

        assert codigo == SALIDA_NINGUNO_CUMPLE
        assert "memoria" in reporte["decision"]["descartes"][-1]["motivo"]

    def test_sale_con_codigo_de_ner_ausente_pero_mide_los_candidatos_de_patrones(
        self, tmp_path: Path
    ) -> None:
        codigo, reporte = _ejecutar(tmp_path, lambda m, v: None)

        assert codigo == SALIDA_SIN_NER
        assert reporte["modelo_ner"]["medido"] is False and set(reporte["candidatos"]) == {
            "1-base",
            "1",
        }

    def test_el_reporte_no_contiene_ningun_valor_de_pii_sembrada(self, tmp_path: Path) -> None:
        _ejecutar(tmp_path, lambda m, v: (_NerFalso(_nombres_sembrados()), 100.0))
        contenido = (tmp_path / "medicion.json").read_text(encoding="utf-8")

        valores = {t.texto[e.inicio : e.fin] for t in cargar_corpus() for e in t.etiquetas}

        assert not any(valor in contenido for valor in valores)

    def test_usa_la_fecha_inyectada_y_la_clase_del_dataset(self, tmp_path: Path) -> None:
        _, reporte = _ejecutar(tmp_path, lambda m, v: None)

        assert reporte["fecha"] == FECHA.isoformat()
        assert reporte["dataset"] == {"clase": "sintetico", "n_textos": 300, "nombre": "pii-mini"}

    def test_main_devuelve_dataset_invalido_si_el_manifiesto_no_es_sintetico(
        self, tmp_path: Path
    ) -> None:
        copia = tmp_path / "data" / "eval" / "pii-mini"
        copia.mkdir(parents=True)
        for archivo in (RAIZ_REPO / "data" / "eval" / "pii-mini").iterdir():
            if archivo.is_file():
                (copia / archivo.name).write_bytes(archivo.read_bytes())
        manifiesto = json.loads((copia / "manifest.json").read_text(encoding="utf-8"))
        manifiesto["clase"] = "real"
        (copia / "manifest.json").write_text(json.dumps(manifiesto), encoding="utf-8")

        assert main(["--out", str(tmp_path / "r")], lambda: FECHA, tmp_path) == SALIDA_DATASET


def test_spacy_y_los_pesos_gpl_solo_estan_en_requirements_eval() -> None:
    raiz = RAIZ_REPO / "apps" / "rag-orchestrator"
    servicio = (raiz / "requirements.txt").read_text(encoding="utf-8").lower()
    medicion = (raiz / "requirements-eval.txt").read_text(encoding="utf-8").lower()

    assert "spacy" not in servicio and "es_core_news" not in servicio
    assert "spacy==3.8.14" in medicion and "es_core_news_md-3.8.0" in medicion
