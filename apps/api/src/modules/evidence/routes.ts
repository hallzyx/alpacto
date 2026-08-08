import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { evidenceFiles, type Database } from "@alpacto/database";
import {
  evidenceUploadSchema,
  evidenceUploadUrlSchema,
} from "@alpacto/shared-schemas";
import type { Queues } from "../../jobs/queues.js";
import { ApiError } from "../../lib/errors.js";
import {
  createPresignedUploadUrl,
  newEvidenceStorageKey,
  publicEvidenceUrl,
  putEvidenceObject,
} from "../../lib/s3.js";

export async function registerEvidenceRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
  queues: Queues,
) {
  /**
   * Preferred on VPS/Dokploy: browser → API → MinIO (internal Docker DNS).
   * Avoids Cloudflare/CORS on the public MinIO host for presigned PUTs.
   */
  app.post("/evidence/upload", { preHandler: authenticate }, async (request) => {
    const body = evidenceUploadSchema.parse(request.body);
    let bytes: Buffer;
    try {
      bytes = Buffer.from(body.fileBase64, "base64");
    } catch {
      throw new ApiError(400, "Invalid fileBase64");
    }
    if (bytes.length === 0) throw new ApiError(400, "Empty file");
    if (bytes.length > 10_485_760) throw new ApiError(400, "File too large (max 10 MiB)");

    const storageKey = newEvidenceStorageKey(body.type);
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    try {
      await putEvidenceObject({
        storageKey,
        body: bytes,
        mimeType: body.mimeType,
      });
    } catch (err) {
      request.log.error({ err, storageKey }, "evidence PutObject failed");
      throw new ApiError(
        502,
        err instanceof Error
          ? `Storage upload failed: ${err.message}`
          : "Storage upload failed",
      );
    }

    const [row] = await db
      .insert(evidenceFiles)
      .values({
        inspectionId: body.inspectionId ?? null,
        type: body.type,
        storageKey,
        sha256,
        mimeType: body.mimeType,
        sizeBytes: BigInt(bytes.length),
      })
      .returning();

    await queues.evidenceFinalize.add("finalize", {
      evidenceId: row!.id,
      storageKey,
      sha256,
    });

    return {
      evidenceId: row!.id,
      storageKey,
      sha256,
      sizeBytes: String(bytes.length),
      url: publicEvidenceUrl(storageKey),
    };
  });

  /** Legacy: presigned URL for direct browser → MinIO (local / no CF proxy). */
  app.post("/evidence/upload-url", { preHandler: authenticate }, async (request) => {
    const body = evidenceUploadUrlSchema.parse(request.body);
    const { storageKey, uploadUrl } = await createPresignedUploadUrl({
      mimeType: body.mimeType,
      type: body.type,
    });
    const placeholderSha = createHash("sha256")
      .update(storageKey)
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
