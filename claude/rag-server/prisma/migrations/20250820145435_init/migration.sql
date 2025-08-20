-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "modified_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL,
    "file_type" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "indexed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "file_metadata" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "file_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "file_metadata_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_chunks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "files_path_key" ON "files"("path");

-- CreateIndex
CREATE INDEX "files_path_idx" ON "files"("path");

-- CreateIndex
CREATE INDEX "files_hash_idx" ON "files"("hash");

-- CreateIndex
CREATE INDEX "files_modified_at_idx" ON "files"("modified_at");

-- CreateIndex
CREATE INDEX "files_file_type_idx" ON "files"("file_type");

-- CreateIndex
CREATE INDEX "file_metadata_file_id_idx" ON "file_metadata"("file_id");

-- CreateIndex
CREATE INDEX "file_metadata_key_idx" ON "file_metadata"("key");

-- CreateIndex
CREATE INDEX "file_metadata_value_idx" ON "file_metadata"("value");

-- CreateIndex
CREATE UNIQUE INDEX "file_metadata_file_id_key_key" ON "file_metadata"("file_id", "key");

-- CreateIndex
CREATE INDEX "document_chunks_file_id_idx" ON "document_chunks"("file_id");

-- CreateIndex
CREATE INDEX "document_chunks_chunk_index_idx" ON "document_chunks"("chunk_index");

-- CreateIndex
CREATE INDEX "document_chunks_embedding_id_idx" ON "document_chunks"("embedding_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_file_id_chunk_index_key" ON "document_chunks"("file_id", "chunk_index");
