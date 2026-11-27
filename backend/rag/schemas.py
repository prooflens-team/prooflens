from typing import Literal
from pydantic import BaseModel


VerificationStatus = Literal[
    "SUPPORTED",
    "CONFLICT",
    "INSUFFICIENT",
    "UNVERIFIABLE"
]


class VerificationResponse(BaseModel):
    status: VerificationStatus
    summary: str
    detail: str
    evidenceIds: list[str]


class EvidenceSource(BaseModel):
    title: str
    publisher: str
    year: int | None = None
    url: str


class VerifiedClaim(BaseModel):
    id: str
    text: str
    status: VerificationStatus
    summary: str
    detail: str
    sources: list[EvidenceSource]
