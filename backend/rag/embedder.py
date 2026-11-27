import os
import numpy as np

from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

MODEL = os.getenv(
    "GEMINI_EMBEDDING_MODEL",
    "gemini-embedding-001"
)

DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "768"))


def embed_text(text, task_type="RETRIEVAL_DOCUMENT"):

    if not isinstance(text, str) or not text.strip():
        raise ValueError("임베딩할 텍스트가 비어 있습니다.")

    response = client.models.embed_content(
        model=MODEL,
        contents=text,
        config=types.EmbedContentConfig(
            task_type=task_type,
            output_dimensionality=DIMENSION
        )
    )

    if not response.embeddings:
        raise RuntimeError("임베딩 결과가 없습니다.")

    vector = np.array(
        response.embeddings[0].values,
        dtype=np.float32
    )

    if len(vector) != DIMENSION:
        raise ValueError("임베딩 벡터 차원이 일치하지 않습니다.")

    # 벡터 정규화
    norm = np.linalg.norm(vector)

    if norm == 0 or not np.isfinite(norm):
        raise ValueError("유효하지 않은 임베딩 벡터입니다.")

    vector = vector / norm

    return vector.tolist()


def embed_document(text):
    return embed_text(text, "RETRIEVAL_DOCUMENT")


def embed_query(text):
    return embed_text(text, "RETRIEVAL_QUERY")


if __name__ == "__main__":

    text = "4주 사용 시 피부 보습력 30% 개선"

    vector = embed_query(text)

    print("===== PROOFLENS Embedding 테스트 =====")
    print(f"입력 문장: {text}")
    print(f"사용 모델: {MODEL}")
    print(f"벡터 차원: {len(vector)}")
    print(f"벡터 일부: {vector[:10]}")
    print(f"벡터 크기: {np.linalg.norm(vector):.6f}")
    print("임베딩 생성 성공")
