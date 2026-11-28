import re
import time

import numpy as np

if __package__:
    from .database import get_connection
    from .embedder import embed_document
    from .load_evidence import load_evidence
    from .chunker import chunk_documents
else:
    from database import get_connection
    from embedder import embed_document
    from load_evidence import load_evidence
    from chunker import chunk_documents


INSERT_DOCUMENT = """
    INSERT INTO public.evidence_documents (
        id,
        title,
        publisher,
        year,
        category,
        source_type,
        url,
        content,
        embedding
    )
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
"""


def stops_after_auth_error(message):
    text = str(message or "").lower()
    return "api key not valid" in text or "unauthenticated" in text


def document_text(document):
    return (
        f"{document['title']}\n"
        f"{document['category']}\n"
        f"{document['content']}"
    )


def document_values(document, embedding):
    return (
        document["id"],
        document["title"],
        document["publisher"],
        document["year"],
        document["category"],
        document["sourceType"],
        document["url"],
        document["content"],
        embedding,
    )


def safe_error(error):
    text = re.sub(r"postgres(?:ql)?://\S+", "[redacted-db-url]", str(error), flags=re.I)
    text = re.sub(r"AIza[\w-]+", "[redacted-api-key]", text)
    return text[:200]


def ingest_documents():
    """전체 자료를 다시 임베딩하고 같은 ID를 덮어쓴다. 기본 적재 경로가 아니다."""
    documents = chunk_documents(load_evidence())

    with get_connection() as conn:
        with conn.cursor() as cur:

            for document in documents:

                embedding = np.array(
                    embed_document(document_text(document)),
                    dtype=np.float32
                )

                cur.execute(
                    INSERT_DOCUMENT + """
                    ON CONFLICT (id) DO UPDATE SET
                        title = EXCLUDED.title,
                        publisher = EXCLUDED.publisher,
                        year = EXCLUDED.year,
                        category = EXCLUDED.category,
                        source_type = EXCLUDED.source_type,
                        url = EXCLUDED.url,
                        content = EXCLUDED.content,
                        embedding = EXCLUDED.embedding;
                    """,
                    document_values(document, embedding),
                )

                print(f"저장 처리: {document['id']} - {document['title']}")

        conn.commit()

    print(f"\n전체 {len(documents)}개 근거자료 저장 완료")


def ingest_missing_documents():
    """DB에 없는 ID만 임베딩하고 추가한다. 기존 행은 읽기만 하고 바꾸지 않는다."""
    documents = chunk_documents(load_evidence())
    started = time.perf_counter()
    embedded = 0
    inserted = []
    skipped = []
    failed = []

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM public.evidence_documents")
            existing = {row[0] for row in cur.fetchall()}

        for document in documents:
            document_id = document["id"]
            if document_id in existing:
                skipped.append(document_id)
                continue

            try:
                embedding = np.array(
                    embed_document(document_text(document)),
                    dtype=np.float32,
                )
                embedded += 1
                with conn.cursor() as cur:
                    cur.execute(
                        INSERT_DOCUMENT + " ON CONFLICT (id) DO NOTHING",
                        document_values(document, embedding),
                    )
                    stored = cur.rowcount
                conn.commit()
            except Exception as error:
                conn.rollback()
                message = safe_error(error)
                failed.append((document_id, message))
                print(f"저장 실패: {document_id}")
                if stops_after_auth_error(message):
                    print("인증 오류라서 나머지 자료는 호출하지 않습니다.")
                    break
                continue

            if stored == 1:
                inserted.append(document_id)
                existing.add(document_id)
                print(f"저장 처리: {document_id} - {document['title']}")
            else:
                skipped.append(document_id)
                print(f"기존 자료 유지: {document_id}")

    elapsed = time.perf_counter() - started
    print(
        f"\n신규 {len(inserted)}개 저장, 기존 {len(skipped)}개 유지, "
        f"임베딩 {embedded}회, 실패 {len(failed)}개, {elapsed:.1f}초"
    )
    for document_id, message in failed:
        print(f"실패 {document_id}: {message}")
    return {
        "inserted": inserted,
        "skipped": skipped,
        "embedded": embedded,
        "failed": failed,
        "elapsed": elapsed,
    }


if __name__ == "__main__":
    print("===== PROOFLENS 누락 근거자료 벡터 저장 =====")
    ingest_missing_documents()
