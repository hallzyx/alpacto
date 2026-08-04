import type { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { evidenceFiles, type Database } from "@alpacto/database";
import { evidenceUploadUrlSchema } from "@alpacto/shared-schemas";
import type { Queues } from "../../jobs/queues.js";
import { ApiError } from "../../lib/errors.js";
import { createPresignedUploadUrl, publicEvidenceUrl } from "../../lib/s3.js";

export async function registerEvidenceRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
  queues: Queues,
) {
  app.post("/evidence/upload-url", { preHandler: authenticate }, async (request) => {
    const body = evidenceUploadUrlSchema.parse(request.body);
    const { storageKey, uploadUrl } = await createPresignedUploadUrl({
      mimeType: body.mimeType,
      type: body.type,
    });
    const placeholderSha = createHash("sha256")
      .update(randomBytes(32))
      .digest("hex");

    const [row] = await db
      .insert(evidenceFiles)
      .values({
        inspectionId: body.inspectionId ?? null,
        type: body.type,
        storageKey,
        sha256: placeholderSha,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
      })
      .returning();

    await queues.evidenceFinalize.add("finalize", {
      evidenceId: row!.id,
      storageKey,
      sha256: placeholderSha,
    });

    return {
      evidenceId: row!.id,
      uploadUrl,
      storageKey,
      expiresInSeconds: 900,
    };
  });

  app.get("/evidence/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(evidenceFiles).where(eq(evidenceFiles.id, id)).limit(1);
    if (!row) throw new ApiError(404, "Evidence not found");
    return {
      id: row.id,
      inspectionId: row.inspectionId,
      type: row.type,
      storageKey: row.storageKey,
      sha256: row.sha256,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes.toString(),
      url: publicEvidenceUrl(row.storageKey),
      createdAt: row.createdAt.toISOString(),
    };
  });
}
