/*
  Warnings:

  - A unique constraint covering the columns `[orgId,name]` on the table `categories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orgId,name]` on the table `hospitals` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orgId,name]` on the table `parties` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code,categoryId]` on the table `services` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "categories_orgId_name_key" ON "categories"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_orgId_name_key" ON "hospitals"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "parties_orgId_name_key" ON "parties"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "services_code_categoryId_key" ON "services"("code", "categoryId");
