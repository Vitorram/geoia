"""Mostra estado da configuração de IA; --probe executa uma única inferência explícita."""

import argparse
import asyncio
import json

from app.core.config import settings
from app.services.ai_search import AIInvalidOutput, AIProviderTimeout, AIUnavailable, get_ai_provider


def configuration_status() -> dict[str, object]:
    model = settings.ai_model.strip() if settings.ai_model else ""
    if settings.ai_provider == "disabled":
        state = "disabled"
    elif not model:
        state = "incomplete"
    else:
        state = "configured"
    api_key = settings.ai_api_key.get_secret_value() if settings.ai_api_key else ""
    return {
        "provider": settings.ai_provider,
        "model": model or None,
        "configuration_state": state,
        "api_base_configured": bool(settings.ai_api_base),
        "api_key_configured": bool(api_key),
        "probe": "not_requested",
    }


async def probe_provider() -> tuple[str, str | None]:
    try:
        result = await get_ai_provider().interpret("Procure um supermercado próximo.")
    except AIProviderTimeout:
        return "timeout", None
    except AIInvalidOutput:
        return "invalid_response", None
    except AIUnavailable:
        return "unavailable", None
    return "available", result.category.value if result.category else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--probe",
        action="store_true",
        help="faz uma inferência curta no provedor configurado; pode enviar dados/cobrar conforme o provedor",
    )
    args = parser.parse_args()
    result = configuration_status()

    if args.probe:
        if result["configuration_state"] != "configured":
            result["probe"] = "skipped_not_configured"
            print(json.dumps(result, ensure_ascii=False))
            return 2
        probe_state, category = asyncio.run(probe_provider())
        result["probe"] = probe_state
        if category:
            result["validated_category"] = category
        print(json.dumps(result, ensure_ascii=False))
        return 0 if probe_state == "available" else 1

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
