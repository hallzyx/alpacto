import { describe, expect, it } from "vitest";
import { evidenceUploadUrlSchema } from "@alpacto/shared-schemas";

describe("evidenceUploadUrlSchema", () => {
  it("rejects invalid mime type", () => {
    const result = evidenceUploadUrlSchema.safeParse({
      type: "scale_photo",
      mimeType: "text/plain",
      sizeBytes: "1024",
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversized upload", () => {
    const result = evidenceUploadUrlSchema.safeParse({
      type: "scale_photo",
      mimeType: "image/jpeg",
      sizeBytes: "20000000",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid jpeg upload", () => {
    const result = evidenceUploadUrlSchema.safeParse({
      type: "scale_photo",
      mimeType: "image/jpeg",
      sizeBytes: "102400",
    });
    expect(result.success).toBe(true);
  });
});
