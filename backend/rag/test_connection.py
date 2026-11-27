import os
from pathlib import Path

from dotenv import load_dotenv
from google import genai

# 프로젝트 경로 설정
BASE_DIR = Path(__file__).resolve().parent.parent

# 환경변수 불러오기
load_dotenv(BASE_DIR / ".env")

# Gemini API 연결
client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

MODEL = os.getenv("GEMINI_MODEL")

# API 연결 테스트
response = client.models.generate_content(
    model=MODEL,
    contents="API 연결 성공이라고만 답변해주세요."
)

print(response.text)
