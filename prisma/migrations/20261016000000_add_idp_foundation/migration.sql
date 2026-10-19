-- IDP Foundation: Add 4 new tables for Intelligent Document Processing
-- Non-destructive: no changes to existing tables
-- Tables: IdpPreprocessJob, IdpExtraction, IdpValidationFlag, IdpPolicyCheck

-- CreateTable
CREATE TABLE "IdpPreprocessJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inputHash" TEXT NOT NULL,
    "inputMime" TEXT NOT NULL,
    "outputHash" TEXT,
    "outputPath" TEXT,
    "toolChain" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IdpExtraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "preprocessJobId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "extractedJson" TEXT NOT NULL,
    "fieldConfidence" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelDigest" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "overallConf" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IdpValidationFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "documentId" TEXT,
    "extractionId" TEXT,
    "flagType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resolvedByUserId" TEXT,
    "resolvedAt" DATETIME,
    "resolutionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IdpPolicyCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "extractionId" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "ruleEvaluated" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "IdpPreprocessJob_inputHash_idx" ON "IdpPreprocessJob"("inputHash");
CREATE INDEX "IdpPreprocessJob_status_idx" ON "IdpPreprocessJob"("status");
CREATE INDEX "IdpPreprocessJob_createdAt_idx" ON "IdpPreprocessJob"("createdAt");
CREATE INDEX "IdpExtraction_documentId_idx" ON "IdpExtraction"("documentId");
CREATE INDEX "IdpExtraction_status_idx" ON "IdpExtraction"("status");
CREATE INDEX "IdpExtraction_docType_idx" ON "IdpExtraction"("docType");
CREATE INDEX "IdpValidationFlag_caseId_status_idx" ON "IdpValidationFlag"("caseId", "status");
CREATE INDEX "IdpValidationFlag_severity_idx" ON "IdpValidationFlag"("severity");
CREATE INDEX "IdpValidationFlag_createdAt_idx" ON "IdpValidationFlag"("createdAt");
CREATE INDEX "IdpPolicyCheck_extractionId_idx" ON "IdpPolicyCheck"("extractionId");
CREATE INDEX "IdpPolicyCheck_policyVersionId_idx" ON "IdpPolicyCheck"("policyVersionId");
