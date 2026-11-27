# PROOFLENS RAG & Evidence Verification

## 1. 모듈 개요

광고 분석 AI에서 추출한 효능 주장을 신뢰할 수 있는 근거자료와 비교하여 검증하는 RAG 기반 모듈입니다. PostgreSQL과 pgvector를 활용하여 관련 근거자료를 검색하고, Gemini를 통해 광고 주장과 근거자료의 일치 여부를 판단합니다.

## 2. 기술 스택

- Python 3.11
- Gemini 3.1 Flash Lite
- Gemini Embedding 001
- PostgreSQL
- pgvector
- Supabase
- Pydantic
- NumPy
- pytest

## 3. 주요 기능

- 근거자료 전처리 및 청킹
- 768차원 임베딩 생성
- PostgreSQL 기반 벡터 저장
- 코사인 유사도 기반 근거자료 검색
- RAG 기반 광고 주장 검증
- 근거자료 출처 제공
- 구매 전 확인사항 생성
- Gemini 서버 오류 발생 시 재시도
- JSON 기반 백엔드 모듈 연동

## 4. 광고 주장 판정 기준

| 상태         | 의미          |
| ------------ | ------------- |
| SUPPORTED    | 근거 확인     |
| CONFLICT     | 근거와 불일치 |
| INSUFFICIENT | 근거 부족     |
| UNVERIFIABLE | 확인 불가     |

## 5. 실행 환경 구축

backend 디렉터리에서 Python 가상환경을 생성하고 필요한 라이브러리를 설치합니다.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-rag.txt
```

## 6. 환경변수 설정

`.env.rag.example`을 참고하여 backend 디렉터리의 `.env` 파일에 다음 환경변수를 설정합니다.

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSION=768
DATABASE_URL=
```

API 키와 데이터베이스 접속 정보는 외부에 공개하지 않습니다.

## 7. 데이터베이스 구축

PostgreSQL에서 `data/schema.sql`을 실행하여 pgvector 확장 기능과 근거자료 저장 테이블을 생성합니다.

다음 명령어를 실행하여 근거자료를 벡터로 변환하고 저장합니다.

```powershell
python rag/ingest.py
python rag/database.py
```

공용 데이터베이스에 근거자료가 이미 저장되어 있다면 ingest 작업을 생략할 수 있습니다.

## 8. 개별 기능 테스트

```powershell
python rag/embedder.py
python rag/chunker.py
python rag/retriever.py
python rag/verifier.py
```

## 9. 통합 실행

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Get-Content tests/sample_analysis.json -Raw -Encoding UTF8 | python -u rag/run_rag.py
```

`run_rag.py`는 광고 정보와 효능 주장 목록을 표준 입력으로 전달받아 검증 결과를 JSON 형식으로 표준 출력에 반환합니다. 진행 상황은 표준 오류 스트림으로 출력합니다.

## 10. 검색 설정

| 항목        | 설정값        |
| ----------- | ------------- |
| 근거자료 수 | 20개          |
| 임베딩 차원 | 768           |
| 검색 방식   | 코사인 유사도 |
| Top-K       | 3             |
| 최소 유사도 | 0.65          |
| Temperature | 0.1           |

## 11. 자동화 테스트

```powershell
python -m pytest tests/test_rag.py tests/test_retry.py -v
```

총 21개의 자동화 테스트를 통과하였습니다.

## 12. 성능 평가

동일한 Gemini 모델과 6개의 광고 주장을 사용하여 RAG 적용 전후의 검증 결과를 비교하였습니다.

| 평가 항목      | RAG 미적용 | RAG 적용 |
| -------------- | ---------: | -------: |
| 판정 일치율    |     66.67% |     100% |
| 출처 제시율    |     66.67% |   83.33% |
| 평균 처리 시간 |     2.97초 |   6.39초 |

비교 실험은 다음 명령어로 실행할 수 있습니다.

```powershell
python -u tests/compare_rag.py
```

## 13. 한계 및 향후 개선 방향

- 제한된 수의 근거자료를 사용하므로 모든 광고 주장을 검증할 수 없습니다.
- 근거자료 전체에 대한 원문 대조 검토가 필요합니다.
- 검색 유사도는 광고 주장의 진실성을 나타내는 확률이 아닙니다.
- 비교 실험은 소규모 표본을 사용하였으며 일반적인 모델 정확도를 보장하지 않습니다.
- 비교 대상 간 프롬프트와 재시도 정책에 차이가 있습니다.
- 외부 API의 응답 지연 및 사용량 제한에 영향을 받을 수 있습니다.
- 광고 분석 AI 및 Express 서버와의 실제 통합 검증이 필요합니다.
- 향후 근거자료 확충, 검색 성능 개선, 병렬 처리 등을 적용할 수 있습니다.

본 모듈은 소비자의 광고 판단을 지원하기 위한 것으로, 제품의 효능이나 안전성 또는 광고의 위법성을 확정하지 않습니다.
