import numpy as np

if __package__:
    from .embedder import embed_document, embed_query
    from .load_evidence import load_evidence
else:
    from embedder import embed_document, embed_query
    from load_evidence import load_evidence


def cosine_similarity(vector_a, vector_b):
    return float(np.dot(vector_a, vector_b))


def build_index():
    documents = load_evidence()
    indexed_documents = []

    for document in documents:
        text = (
            f"{document['title']}\n"
            f"{document['category']}\n"
            f"{document['content']}"
        )

        vector = embed_document(text)

        indexed_documents.append({
            **document,
            "embedding": vector
        })

    return indexed_documents


def search_evidence(query, indexed_documents, top_k=3):

    query_vector = embed_query(query)
    results = []

    for document in indexed_documents:

        score = cosine_similarity(
            query_vector,
            document["embedding"]
        )

        result = {
            key: value
            for key, value in document.items()
            if key != "embedding"
        }

        result["similarity"] = score
        results.append(result)

    results.sort(
        key=lambda item: item["similarity"],
        reverse=True
    )

    return results[:top_k]


if __name__ == "__main__":

    print("===== PROOFLENS 근거 검색 테스트 =====")
    print("근거자료 임베딩 생성 중...")

    indexed_documents = build_index()

    print(f"인덱싱 완료: {len(indexed_documents)}개")

    query = input("\n검증할 광고 주장을 입력하세요: ")

    results = search_evidence(
        query,
        indexed_documents,
        top_k=3
    )

    print("\n===== 근거자료 검색 결과 =====")

    for rank, result in enumerate(results, start=1):
        print(f"\n순위: {rank}")
        print(f"제목: {result['title']}")
        print(f"유사도: {result['similarity']:.4f}")
        print(f"내용: {result['content']}")
        print(f"출처: {result['url']}")
