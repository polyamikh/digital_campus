-- External test-platform links are optional; existing tests remain valid.
ALTER TABLE "Test" ADD COLUMN "externalUrl" VARCHAR(2000);
