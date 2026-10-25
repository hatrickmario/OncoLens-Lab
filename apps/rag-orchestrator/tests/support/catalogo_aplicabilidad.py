"""Fixtures FX-08b-a de criterios de aplicabilidad (L1D-126): copia de las de ``packages/clinical-catalogs``."""

from pathlib import Path

from tests.support.contract import CATALOGOS

FIXTURES_DE_APLICABILIDAD = Path(__file__).resolve().parents[1] / "fixtures" / "catalogo"
APL_1_0_0 = FIXTURES_DE_APLICABILIDAD / "test-apl-1.0.0"
APL_1_0_1 = FIXTURES_DE_APLICABILIDAD / "test-apl-1.0.1"
ORIGEN_DE_LAS_FIXTURES = CATALOGOS / "test" / "fixtures"
