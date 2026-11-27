def chunk_text(text, chunk_size=500, overlap=100):
    if chunk_size <= 0 or not 0 <= overlap < chunk_size:
        raise ValueError("잘못된 청킹 설정입니다.")

    text = text.strip()

    if not text:
        return []

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])

        if end == len(text):
            break

        start = end - overlap

    return chunks


def chunk_documents(documents):
    results = []

    for document in documents:
        chunks = chunk_text(document["content"])

        for index, chunk in enumerate(chunks, start=1):
            results.append({
                **document,
                "id": (
                    document["id"]
                    if len(chunks) == 1
                    else f"{document['id']}_{index:03d}"
                ),
                "content": chunk
            })

    return results


if __name__ == "__main__":
    if __package__:
        from .load_evidence import load_evidence
    else:
        from load_evidence import load_evidence

    documents = load_evidence()
    chunks = chunk_documents(documents)

    print("===== PROOFLENS 청킹 테스트 =====")
    print(f"원본 문서 수: {len(documents)}")
    print(f"청크 수: {len(chunks)}")

    for chunk in chunks:
        print(f"{chunk['id']}: {len(chunk['content'])}자")
