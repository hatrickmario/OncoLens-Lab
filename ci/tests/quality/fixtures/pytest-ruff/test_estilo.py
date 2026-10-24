import pytest


@pytest.fixture(scope="function")
def valor():
    return 1


def test_a(valor):
    assert valor == 1 and valor > 0
