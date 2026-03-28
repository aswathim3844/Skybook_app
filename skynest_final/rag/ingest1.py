

import os
from pathlib import Path
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import MarkdownTextSplitter
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from dotenv import load_dotenv

load_dotenv(override=True)

EMBEDDING_MODEL = "text-embedding-3-large"
DB_NAME         = str(Path(__file__).parent.parent / "vector_db")
KNOWLEDGE_BASE  = str(Path(__file__).parent.parent / "knowledge-base")


def fetch_documents():
    folders = [f for f in Path(KNOWLEDGE_BASE).iterdir() if f.is_dir()]
    documents = []
    for folder in folders:
        doc_type = folder.name
        loader = DirectoryLoader(
            str(folder),
            glob="**/*.md",
            loader_cls=TextLoader,
            loader_kwargs={"encoding": "utf-8"},
        )
        for doc in loader.load():
            doc.metadata["doc_type"] = doc_type
            documents.append(doc)
    print(f"Loaded {len(documents)} documents")
    return documents


def create_chunks(documents):
   
    splitter = MarkdownTextSplitter()
    chunks = splitter.split_documents(documents)
    print(f"Created {len(chunks)} chunks (header-based, no size limit)")
    return chunks


def create_embeddings(chunks):
    embeddings = OpenAIEmbeddings(model=EMBEDDING_MODEL)

    if os.path.exists(DB_NAME):
        Chroma(persist_directory=DB_NAME, embedding_function=embeddings).delete_collection()

    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=DB_NAME,
    )
    collection = vectorstore._collection
    count      = collection.count()
    dims       = len(collection.get(limit=1, include=["embeddings"])["embeddings"][0])
    print(f"Vector store ready — {count:,} vectors @ {dims:,} dimensions")
    return vectorstore


if __name__ == "__main__":
    docs   = fetch_documents()
    chunks = create_chunks(docs)
    create_embeddings(chunks)
    print("Ingestion complete")
