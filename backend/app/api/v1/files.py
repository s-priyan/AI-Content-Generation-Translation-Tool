"""`POST /api/v1/parse-file` — extract text from an uploaded file."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from app.config import Settings, get_settings
from app.core.exceptions import FileTooLargeError
from app.dependencies import get_file_parser_service
from app.schemas.files import ParsedFileResponse
from app.services.file_parser import FileParserService

router = APIRouter(tags=["files"])


@router.post("/parse-file", response_model=ParsedFileResponse)
async def parse_file(
    file: UploadFile = File(...),
    service: FileParserService = Depends(get_file_parser_service),
    settings: Settings = Depends(get_settings),
) -> ParsedFileResponse:
    """Parse an uploaded file via Docling and return its extracted text.

    @throws FileTooLargeError if the upload exceeds `MAX_FILE_SIZE_MB`.
    @throws FileParsingError if the converter fails.
    """
    contents = await file.read()
    if len(contents) > settings.max_file_size_bytes:
        raise FileTooLargeError(
            f"File exceeds {settings.max_file_size_mb} MB limit."
        )

    return await service.parse(contents, file.filename or "upload.bin")
