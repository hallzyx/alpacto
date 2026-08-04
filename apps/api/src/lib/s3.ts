import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
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

export async function ensureBucket(): Promise<void> {
  const s3 = getS3Client();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
  }
}

export async function createPresignedUploadUrl(input: {
  mimeType: string;
  type: string;
}): Promise<{ storageKey: string; uploadUrl: string }> {
  const storageKey = `evidence/${input.type}/${randomUUID()}`;
  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: storageKey,
    ContentType: input.mimeType,
  });
  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: 900,
  });
  return { storageKey, uploadUrl };
}

export function publicEvidenceUrl(storageKey: string): string {
  return `${config.s3.endpoint}/${config.s3.bucket}/${storageKey}`;
}
