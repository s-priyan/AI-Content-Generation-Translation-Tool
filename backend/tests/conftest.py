"""Shared pytest fixtures.

Sets a dummy `ANTHROPIC_API_KEY` so the `Settings` model can instantiate
without contacting the real environment during unit tests.
"""

from __future__ import annotations

import os

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
