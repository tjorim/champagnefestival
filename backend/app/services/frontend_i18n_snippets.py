"""A handful of translated UI strings duplicated from ``frontend/messages/*.json``
for server-rendered pages (#992).

paraglide-js compiles the frontend's translations into the JS bundle at
build time; this backend process only has ``frontend/dist`` mounted in
production (the built shell and its hashed assets, not the ``messages/``
source files — see ``app.config.Settings.frontend_dist_path`` and
docs/decisions/992-live-public-render.md's infra companion requirement), so
it cannot read the real translation files at runtime.

These four keys are duplicated here instead, kept deliberately small and
static (no interpolation, no pluralization). ``backend/tests/test_jsonld_service.py``
and ``backend/tests/test_public_pages.py`` read the real
``frontend/messages/*.json`` files (available in this repo checkout at test
time, just not in the production container) and fail if any of these drift
from them — so an edit to the real translation without updating this file
breaks CI rather than silently going stale in the server-rendered output.
"""

from __future__ import annotations

from typing import Literal

Locale = Literal["nl", "en", "fr"]

FESTIVAL_NAME = "Champagnefestival"

WELCOME_SUBTITLE: dict[Locale, str] = {
    "nl": "Een viering van fijne champagne en gemeenschap",
    "en": "A celebration of fine champagne and community",
    "fr": "Une célébration du champagne fin et de la communauté",
}

FAQ_TITLE: dict[Locale, str] = {
    "nl": "Veelgestelde Vragen",
    "en": "Frequently Asked Questions",
    "fr": "Questions Fréquemment Posées",
}

SCHEDULE_TITLE: dict[Locale, str] = {
    "nl": "Programma",
    "en": "Schedule",
    "fr": "Programme",
}
