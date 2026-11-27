import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "evidence.json"


def load_evidence():
    with open(DATA_PATH, "r", encoding="utf-8-sig") as file:
        documents = json.load(file)

    return documents


if __name__ == "__main__":
    documents = load_evidence()

    print("===== PROOFLENS 근거자료 =====")
    print(f"전체 근거자료 수: {len(documents)}개")

    for document in documents:
        print(f"\nID: {document['id']}")
        print(f"제목: {document['title']}")
        print(f"기관: {document['publisher']}")
        print(f"내용: {document['content']}")
        print(f"출처: {document['url']}")
