"""Vigencia de un hilo del chat (RN-22): regla pura."""

from datetime import UTC, datetime, timedelta

from app.domain.chat.vigencia import hilo_vencido

AHORA = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)


def test_hilo_no_vencido_cuando_pasa_menos_del_ttl():
    assert hilo_vencido(AHORA - timedelta(seconds=59), AHORA, 60) is False


def test_hilo_no_vencido_cuando_pasa_exactamente_el_ttl():
    assert hilo_vencido(AHORA - timedelta(seconds=60), AHORA, 60) is False


def test_hilo_vencido_cuando_pasa_mas_del_ttl():
    assert hilo_vencido(AHORA - timedelta(seconds=61), AHORA, 60) is True
