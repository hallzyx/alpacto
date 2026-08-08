import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

let internalClient: S3Client | null = null;
let presignClient: S3Client | null = null;

function buildS3Client(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: config.s3.region,
    credentials: {
      accessKeyId: config.s3.accessKey,
      secretAccessKey: config.s3.secretKey,
    },
    forcePathStyle: true,
  });
}

/** Server-side MinIO (Docker DNS). */
export function getS3Client(): S3Client {
  if (!internalClient) {
    internalClient = buildS3Client(config.s3.endpoint);
  }
  return internalClient;
}

/** Presigned URLs for the browser — must sign with the public host the client will call. */
function getPresignS3Client(): S3Client {
  if (!presignClient) {
    const endpoint = config.s3.publicEndpoint.trim() || config.s3.endpoint;
    presignClient = buildS3Client(endpoint);
  }
  return presignClient;
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
  const uploadUrl = await getSignedUrl(getPresignS3Client(), command, {
    expiresIn: 900,
  });
  return { storageKey, uploadUrl };
}

export function publicEvidenceUrl(storageKey: string): string {
  return `${config.s3.publicEndpoint}/${config.s3.bucket}/${storageKey}`;
}
