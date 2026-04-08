-- CreateEnum
CREATE TYPE "ExtractionPipeline" AS ENUM ('CLAIM', 'BILLS');

-- AlterTable
ALTER TABLE "ocr_usage_logs" ADD COLUMN     "pipeline" "ExtractionPipeline" NOT NULL DEFAULT 'CLAIM';

-- CreateIndex
CREATE INDEX "ocr_usage_logs_orgId_pipeline_createdAt_idx" ON "ocr_usage_logs"("orgId", "pipeline", "createdAt");
