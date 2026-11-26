from pydantic import BaseModel, Field


# 광고 기본 정보
class AdInfo(BaseModel):
    title: str
    platform: str
    ad_copy: str = Field(alias="copy")
    productName: str
    category: str
    conditions: list[str]
    analyzedAt: str


# 개별 효능 주장
class Claim(BaseModel):
    id: str
    text: str


# 광고 분석 결과
class AnalysisResult(BaseModel):
    ad: AdInfo
    claims: list[Claim]


# Gemini 응답 구조
class AnalysisResponse(BaseModel):
    multipleProducts: bool
    result: AnalysisResult