from datetime import date

from app.infrastructure.catalog.catalogo_reader import ficha_de_fila

FILA = {
    "title": "Breast Cancer Treatment (test)",
    "source_name": "NCI PDQ",
    "external_id": "CDR-TEST-001",
    "language": "en",
    "source_type": "guideline",
    "license_class": "dominio_publico",
    "study_design": "guia",
    "trial_phase": None,
    "primary_endpoint": "",
    "sample_size": None,
    "published_at": date(2025, 3, 1),
    "last_updated_at": None,
    "guideline_version": "",
    "source_url": "",
}


def test_ficha_de_fila_copia_los_metadatos_del_catalogo():
    ficha = ficha_de_fila(FILA)

    assert (ficha.title, ficha.source_name, ficha.external_id) == (
        "Breast Cancer Treatment (test)",
        "NCI PDQ",
        "CDR-TEST-001",
    )
    assert (ficha.language, ficha.source_type, ficha.license_class) == (
        "en",
        "guideline",
        "dominio_publico",
    )
    assert ficha.published_at == date(2025, 3, 1)


def test_ficha_de_fila_devuelve_none_y_no_cadena_vacia_cuando_el_catalogo_no_registra_el_campo():
    ficha = ficha_de_fila(FILA)

    assert ficha.trial_phase is None
    assert ficha.primary_endpoint is None
    assert ficha.guideline_version is None
    assert ficha.authors is None
    assert ficha.source_url is None


def test_ficha_de_fila_copia_la_url_de_la_fuente_cuando_el_catalogo_la_registra():
    ficha = ficha_de_fila({**FILA, "source_url": "https://www.cancer.gov/types/breast/hp/breast-treatment-pdq"})

    assert ficha.source_url == "https://www.cancer.gov/types/breast/hp/breast-treatment-pdq"
