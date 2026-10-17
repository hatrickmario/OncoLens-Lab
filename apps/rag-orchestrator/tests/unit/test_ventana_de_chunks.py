"""La regla tamaño/solape del chunk es una sola: la configuración de ADR-39, la del cargador y ``fragmentar`` coinciden."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config.modelos import CLAVES_ADR39, ConfigInvalida, cargar_config_modelos
from app.config.settings import CorpusSeedSettings
from app.domain.corpus_seed.chunking import fragmentar
from app.evaluation.chequeo_config import leer_env
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras

ENV_EXAMPLE = Path(__file__).resolve().parents[2] / ".env.example"
RESTO_DE_CLAVES_DEL_CARGADOR = {
    "CORPUS_SEED_MANIFEST_PATH": "/data/seed/manifest.yaml",
    "CORPUS_ACCEPTED_LICENSES": "cc_by",
    "CORPUS_EXCLUDED_SOURCES": "NCCN",
    "CORPUS_CUTOFF_DATE": "2026-10-16",
}
INVALIDOS = [(0, 0), (-1, 0), (5, -1), (5, 5), (5, 9)]
VALIDOS = [(1024, 0), (6, 2), (2, 1)]


def entorno_de_adr39(tamano: int, solape: int) -> dict[str, str]:
    base = leer_env(ENV_EXAMPLE.read_text(encoding="utf-8"))
    claves = {k: v for k, v in base.items() if k in CLAVES_ADR39}
    return {**claves, "CORPUS_CHUNK_SIZE": str(tamano), "CORPUS_CHUNK_OVERLAP": str(solape)}


def configurar_cargador(
    monkeypatch: pytest.MonkeyPatch, tamano: int, solape: int
) -> CorpusSeedSettings:
    for clave, valor in {
        **RESTO_DE_CLAVES_DEL_CARGADOR,
        "CORPUS_CHUNK_SIZE": str(tamano),
        "CORPUS_CHUNK_OVERLAP": str(solape),
    }.items():
        monkeypatch.setenv(clave, valor)
    return CorpusSeedSettings(_env_file=None)  # type: ignore[call-arg]


@pytest.mark.parametrize(("tamano", "solape"), INVALIDOS)
def test_las_tres_aplicaciones_de_la_regla_rechazan_el_mismo_par_invalido(
    monkeypatch: pytest.MonkeyPatch, tamano: int, solape: int
) -> None:
    with pytest.raises(ConfigInvalida):
        cargar_config_modelos(entorno_de_adr39(tamano, solape))
    with pytest.raises(ValidationError):
        configurar_cargador(monkeypatch, tamano, solape)
    with pytest.raises(ValueError, match="tamano|solape"):
        fragmentar("uno dos", TokenizadorPorPalabras(), tamano=tamano, solape=solape)


@pytest.mark.parametrize(("tamano", "solape"), VALIDOS)
def test_las_tres_aplicaciones_de_la_regla_aceptan_el_mismo_par_valido(
    monkeypatch: pytest.MonkeyPatch, tamano: int, solape: int
) -> None:
    modelos = cargar_config_modelos(entorno_de_adr39(tamano, solape))
    cargador = configurar_cargador(monkeypatch, tamano, solape)

    assert (modelos.corpus_chunk_size, modelos.corpus_chunk_overlap) == (tamano, solape)
    assert (cargador.corpus_chunk_size, cargador.corpus_chunk_overlap) == (tamano, solape)
    assert fragmentar("uno dos tres", TokenizadorPorPalabras(), tamano=tamano, solape=solape)
