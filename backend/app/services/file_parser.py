"""File parsing service backed by Docling.

Docling parses PDFs, DOCX, PPTX, HTML and images into a unified document
representation. The conversion is CPU-bound (layout + OCR) so we offload to a
worker thread via `asyncio.to_thread`.

The converter is initialized lazily on the first call so that:
- App startup stays fast.
- Tests can monkey-patch `_get_converter()` without touching the real model.
"""

from __future__ import annotations

import mimetypes
import os
import tempfile
from pathlib import Path
from typing import Any

from app.core.exceptions import FileParsingError
from app.core.logging import get_logger
from app.schemas.files import ParsedFileResponse

logger = get_logger(__name__)


class FileParserService:
    """Async wrapper around Docling's `DocumentConverter`."""

    _SUPPORTED_EXTS: tuple[str, ...] = (
        ".pdf", ".docx", ".pptx", ".html", ".htm",
        ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp",
        ".md", ".txt",
    )

    def __init__(self) -> None:
        self._converter: Any | None = None

    def _get_converter(self) -> Any:
        """Lazily build the Docling converter on first use.

        @throws FileParsingError if Docling is not installed in this environment.
        """
        if self._converter is None:
            try:
                from docling.document_converter import DocumentConverter  # type: ignore
            except ImportError as exc:
                raise FileParsingError(
                    "Docling is not installed; cannot parse rich files."
                ) from exc
            self._converter = DocumentConverter()
        return self._converter

    async def parse(self, file_bytes: bytes, filename: str) -> ParsedFileResponse:
        """Parse a file's bytes into structured `ParsedFileResponse`.

        @throws FileParsingError on Docling failures or unsupported types.
        """
        import asyncio

        if not file_bytes:
            raise FileParsingError("Uploaded file is empty.")

        ext = Path(filename).suffix.lower()
        if ext and ext not in self._SUPPORTED_EXTS:
            raise FileParsingError(f"Unsupported file extension: {ext}")

        if ext in (".txt", ".md"):
            return self._parse_plaintext(file_bytes, filename)

        return await asyncio.to_thread(self._convert_sync, file_bytes, filename)

    def _parse_plaintext(self, file_bytes: bytes, filename: str) -> ParsedFileResponse:
        """Fast path for plain text — no Docling needed."""
        try:
            text = file_bytes.decode("utf-8", errors="replace")
        except Exception as exc:
            raise FileParsingError(f"Failed to decode {filename}: {exc}") from exc

        return ParsedFileResponse(
            filename=filename,
            text=text,
            page_count=None,
            word_count=len(text.split()),
            mime_type=mimetypes.guess_type(filename)[0] or "text/plain",
        )

    def _convert_sync(self, file_bytes: bytes, filename: str) -> ParsedFileResponse:
        """Run Docling against a temp file path.

        @throws FileParsingError if the converter raises.
        """
        converter = self._get_converter()
        suffix = Path(filename).suffix or ".bin"
        tmp_path: str | None = None

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(file_bytes)
                tmp.flush()
                tmp_path = tmp.name

            result = converter.convert(tmp_path)
            document = getattr(result, "document", None)
            if document is None:
                raise FileParsingError("Docling returned no document.")

            text = self._extract_text(document)
            page_count = self._extract_page_count(document)
        except FileParsingError:
            raise
        except Exception as exc:
            logger.exception("docling conversion failed for %s", filename)
            raise FileParsingError(f"Failed to parse {filename}: {exc}") from exc
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    logger.warning("could not remove temp file %s", tmp_path)

        return ParsedFileResponse(
            filename=filename,
            text=text,
            page_count=page_count,
            word_count=len(text.split()),
            mime_type=mimetypes.guess_type(filename)[0] or "application/octet-stream",
        )

    @staticmethod
    def _extract_text(document: Any) -> str:
        """Best-effort text extraction across Docling versions."""
        for method in ("export_to_markdown", "export_to_text"):
            fn = getattr(document, method, None)
            if callable(fn):
                try:
                    return str(fn())
                except Exception:  # noqa: BLE001 — fall through to next method
                    continue
        return str(document)

    @staticmethod
    def _extract_page_count(document: Any) -> int | None:
        pages = getattr(document, "pages", None)
        if pages is None:
            return None
        try:
            return len(pages)
        except TypeError:
            return None
