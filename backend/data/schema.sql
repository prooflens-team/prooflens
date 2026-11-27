-- pgvector 확장 기능 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 근거자료 및 임베딩 저장 테이블
CREATE TABLE IF NOT EXISTS public.evidence_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    publisher TEXT NOT NULL,
    year INTEGER,
    category TEXT,
    source_type TEXT,
    url TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 외부 접근 제한
ALTER TABLE public.evidence_documents
ENABLE ROW LEVEL SECURITY;