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


def ingest_documents():
    documents = chunk_documents(load_evidence())

    with get_connection() as conn:
        with conn.cursor() as cur:

            for document in documents:

                text = (
                    f"{document['title']}\n"
                    f"{document['category']}\n"
                    f"{document['content']}"
                )

                embedding = np.array(
                    embed_document(text),
                    dtype=np.float32
                )

                cur.execute("""
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
                    ON CONFLICT (id) DO UPDATE SET
                        title = EXCLUDED.title,
                        publisher = EXCLUDED.publisher,
                        year = EXCLUDED.year,
                        category = EXCLUDED.category,
                        source_type = EXCLUDED.source_type,
                        url = EXCLUDED.url,
                        content = EXCLUDED.content,
                        embedding = EXCLUDED.embedding;
                """, (
                    document["id"],
                    document["title"],
                    document["publisher"],
                    document["year"],
                    document["category"],
                    document["sourceType"],
                    document["url"],
                    document["content"],
                    embedding
                ))

                print(f"저장 처리: {document['id']} - {document['title']}")

        conn.commit()

    print(f"\n전체 {len(documents)}개 근거자료 저장 완료")


if __name__ == "__main__":
    print("===== PROOFLENS 근거자료 벡터 저장 =====")
    ingest_documents()
