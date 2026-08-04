import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../config.js";

let client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
      },
      forcePathStyle: true,
    });
  }
  return client;
}

export async function downloadEvidenceBase64(storageKey: string): Promise<{
  base64: string;
  mimeType: string;
}> {
  const s3 = getS3Client();
  const res = await s3.send(
    new GetObjectCommand({ Bucket: config.s3.bucket, Key: storageKey }),
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Empty evidence object: ${storageKey}`);
  return {
    base64: Buffer.from(bytes).toString("base64"),
    mimeType: res.ContentType ?? "image/jpeg",
  };
}
