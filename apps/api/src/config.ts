import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export const config = {
  port: Number(process.env["PORT"] ?? 4000),
  host: process.env["HOST"] ?? "0.0.0.0",
  appUrl: process.env["APP_URL"] ?? "http://localhost:3000",
  databaseUrl:
    process.env["DATABASE_URL"] ??
    "postgresql://alpacto:alpacto@localhost:5432/alpacto",
  redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  jwtSecret: process.env["JWT_SECRET"] ?? "alpacto-demo-jwt-secret-change-me",
  s3: {
    endpoint: process.env["S3_ENDPOINT"] ?? "http://127.0.0.1:9000",
    region: process.env["S3_REGION"] ?? "us-east-1",
    bucket: process.env["S3_BUCKET"] ?? "alpacto-evidence",
    accessKey: process.env["S3_ACCESS_KEY"] ?? "alpacto",
    secretKey: process.env["S3_SECRET_KEY"] ?? "alpacto123",
  },
};
