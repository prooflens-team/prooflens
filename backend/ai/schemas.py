from pydantic import BaseModel, Field


# 인체적용시험 및 안전성 시험 정보
class TestCondition(BaseModel):
    id: str
    sourceId: str | None = None
    testType: str | None = None
    institution: str | None = None
    participants: str | None = None
    sampleSize: int | None = None
    startDate: str | None = None
    endDate: str | None = None
    duration: str | None = None
    result: str | None = None


# 광고 기본 정보
class AdInfo(BaseModel):
    title: str
    platform: str
    ad_copy: str = Field(alias="copy")
    productName: str | None = None
    category: str
    conditions: list[str]
    analyzedAt: str

    # 추가 제품 정보
    brandName: str | None = None
    targetAudience: str | None = None
    ingredients: list[str] = Field(default_factory=list)

    # 시험 정보
    testConditions: list[TestCondition] = Field(
        default_factory=list
    )


# 영상 내 광고 주장 등장 시간
class Timestamp(BaseModel):
    sourceId: str
    startSeconds: float = Field(ge=0)
    endSeconds: float | None = Field(default=None, ge=0)


# 개별 광고 주장
class Claim(BaseModel):
    id: str
    text: str

    # 광고 주장 유형
    claimType: str | None = None

    # 광고 출처 및 관련 시험
    sourceIds: list[str] = Field(default_factory=list)
    testIds: list[str] = Field(default_factory=list)

    # 개별 주장에 적용되는 조건
    conditions: list[str] = Field(default_factory=list)

    # 영상 내 등장 시간
    timestamps: list[Timestamp] = Field(
        default_factory=list
    )


# 광고 분석 결과
class AnalysisResult(BaseModel):
    ad: AdInfo
    claims: list[Claim]


# Gemini 응답 구조
class AnalysisResponse(BaseModel):
    multipleProducts: bool
    result: AnalysisResult