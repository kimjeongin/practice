-- CreateTable
CREATE TABLE "embedding_metadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "model_name" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "model_version" TEXT,
    "config_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "total_documents" INTEGER NOT NULL DEFAULT 0,
    "total_vectors" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "embedding_metadata_model_name_idx" ON "embedding_metadata"("model_name");

-- CreateIndex
CREATE INDEX "embedding_metadata_service_name_idx" ON "embedding_metadata"("service_name");

-- CreateIndex
CREATE INDEX "embedding_metadata_is_active_idx" ON "embedding_metadata"("is_active");

-- CreateIndex
CREATE INDEX "embedding_metadata_config_hash_idx" ON "embedding_metadata"("config_hash");
