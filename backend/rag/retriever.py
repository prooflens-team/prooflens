import numpy as np
from psycopg.rows import dict_row

if __package__:
    from .database import get_connection
    from .embedder import embed_query
else:
    from database import get_connection
    from embedder import embed_query


def search_evidence(query, top_k=3, min_similarity=0.65):

    if not isinstance(query, str) or not query.strip():
        raise ValueError("검색할 광고 주장이 비어 있습니다.")

    if not isinstance(top_k, int) or top_k < 1:
        raise ValueError("top_k는 양의 정수여야 합니다.")

    query_vector = np.array(
        embed_query(query),
        dtype=np.float32
    )

    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:

            cur.execute("""
                SELECT
                    id,
                    title,
                    publisher,
                    year,
                    category,
                    source_type AS "sourceType",
                    url,
                    content,
                    1 - (embedding <=> %s) AS similarity
                FROM public.evidence_documents
                ORDER BY embedding <=> %s
                LIMIT %s;
            """, (
                query_vector,
                query_vector,
                top_k
            ))

            results = cur.fetchall()

    if min_similarity is not None:
        results = [
            result for result in results
            if result["similarity"] >= min_similarity
        ]

    return results


if __name__ == "__main__":

    print("===== PROOFLENS pgvector 검색 테스트 =====")

    query = input("\n검증할 광고 주장을 입력하세요: ")

    results = search_evidence(query, top_k=3)

    print("\n===== 근거자료 검색 결과 =====")

    if not results:
        print("관련 근거자료가 없습니다.")

    for rank, result in enumerate(results, start=1):

        print(f"\n순위: {rank}")
        print(f"ID: {result['id']}")
        print(f"제목: {result['title']}")
        print(f"기관: {result['publisher']}")
        print(f"유사도: {result['similarity']:.4f}")
        print(f"내용: {result['content']}")
        print(f"출처: {result['url']}")
