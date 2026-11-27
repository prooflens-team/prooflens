import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from pgvector.psycopg import register_vector

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def get_connection():
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise ValueError("DATABASE_URL이 설정되지 않았습니다.")

    conn = psycopg.connect(
        database_url,
        sslmode="require",
        connect_timeout=10
    )

    try:
        register_vector(conn)
    except Exception:
        conn.close()
        raise

    return conn


if __name__ == "__main__":
    print("===== PROOFLENS DB 연결 테스트 =====")

    with get_connection() as conn:
        with conn.cursor() as cur:

            cur.execute("SELECT current_database();")
            print("데이터베이스:", cur.fetchone()[0])

            cur.execute("""
                SELECT extversion
                FROM pg_extension
                WHERE extname = 'vector';
            """)
            print("pgvector 버전:", cur.fetchone()[0])

            cur.execute("""
                SELECT COUNT(*)
                FROM public.evidence_documents;
            """)
            print("저장된 근거자료 수:", cur.fetchone()[0])

    print("데이터베이스 연결 성공")
