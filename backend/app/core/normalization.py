"""Normalização de valores de entrada compartilhada pelo cadastro e login."""


def normalize_email(email: str) -> str:
    return email.strip().casefold()
