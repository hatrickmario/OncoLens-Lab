"""El arnés de PostgreSQL de test revalida el prefijo antes de conectar (US-058 D7, Gate 1 2ª vuelta)."""

from __future__ import annotations

from pathlib import Path

import pytest

from tests.support.pg import (
    ErrorArnes,
    leer_configuracion_arnes,
    validar_nombre_base_de_test,
    validar_prefijo_test_db,
)

BASE_CLINICA = "oncolens"
URL_ADMIN = "postgresql://oncolens_test_admin:clave-ficticia@postgres:5432/postgres?sslmode=require"


@pytest.mark.parametrize(
    ("prefijo", "base_clinica"),
    [
        (".*", BASE_CLINICA),
        ("Ab", BASE_CLINICA),
        ("oncolens", "oncolens"),
        ("post", BASE_CLINICA),
        ("template", BASE_CLINICA),
        ("templ", BASE_CLINICA),
    ],
)
def test_arnes_pg_prefijo_invalido_o_que_casa_con_bases_del_sistema_aborta(
    prefijo: str, base_clinica: str
) -> None:
    with pytest.raises(ErrorArnes) as error:
        validar_prefijo_test_db(prefijo, base_clinica)

    assert "PG_TEST_DB_PREFIX" in str(error.value)


@pytest.mark.parametrize("prefijo", ["oltest_", "olt_pytest_"])
def test_arnes_pg_acepta_un_prefijo_que_no_casa_con_ninguna_base_reservada(prefijo: str) -> None:
    validar_prefijo_test_db(prefijo, BASE_CLINICA)


@pytest.mark.parametrize(
    "nombre",
    [
        "oncolens",
        "postgres",
        "template1",
        "otra_base",
        "oltest_",
        'oltest_x"; DROP DATABASE oncolens;--',
    ],
)
def test_arnes_pg_nombre_generado_fuera_del_prefijo_o_reservado_no_se_crea_ni_se_borra(
    nombre: str,
) -> None:
    with pytest.raises(ErrorArnes):
        validar_nombre_base_de_test(nombre, "oltest_", BASE_CLINICA)


def test_arnes_pg_nombre_con_el_prefijo_es_valido() -> None:
    validar_nombre_base_de_test("oltest_ab12cd34", "oltest_", BASE_CLINICA)


def test_arnes_pg_falta_de_variable_se_informa_por_nombre_y_sin_la_url(tmp_path: Path) -> None:
    entorno = {"PG_TEST_DB_PREFIX": "oltest_", "TEST_DATABASE_URL": URL_ADMIN}

    with pytest.raises(ErrorArnes) as error:
        leer_configuracion_arnes(entorno)

    assert "PG_RAG_CORPUS_PASSWORD_FILE" in str(error.value) and "clave-ficticia" not in str(
        error.value
    )


def test_arnes_pg_exige_sslmode_require_en_la_url_de_administracion() -> None:
    entorno = {
        "PG_TEST_DB_PREFIX": "oltest_",
        "TEST_DATABASE_URL": URL_ADMIN.replace("?sslmode=require", ""),
    }

    with pytest.raises(ErrorArnes) as error:
        leer_configuracion_arnes(entorno)

    assert "sslmode=require" in str(error.value) and "clave-ficticia" not in str(error.value)
