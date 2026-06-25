"""Custom exception hierarchy.

Codes are stable identifiers consumed by the frontend's error handling logic.
Messages may evolve, codes must not.
"""

from __future__ import annotations


class AppException(Exception):
    """Base class for application errors with a stable string code."""

    code: str = "APP_ERROR"
    status_code: int = 500

    def __init__(self, message: str = "", *, details: dict | None = None) -> None:
        super().__init__(message or self.code)
        self.message: str = message or self.code
        self.details: dict = details or {}


class AnthropicAPIError(AppException):
    code = "ANTHROPIC_ERROR"
    status_code = 502


class FileParsingError(AppException):
    code = "FILE_PARSE_ERROR"
    status_code = 422


class FileTooLargeError(AppException):
    code = "FILE_TOO_LARGE"
    status_code = 413


class SessionNotFoundError(AppException):
    code = "SESSION_NOT_FOUND"
    status_code = 404


class AgentValidationError(AppException):
    code = "AGENT_VALIDATION_ERROR"
    status_code = 502


class InvalidRequestError(AppException):
    code = "INVALID_REQUEST"
    status_code = 400
