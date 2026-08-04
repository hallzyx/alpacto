import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export const PROMPT_VERSION = "ayni-v1";

export const config = {
  databaseUrl:
    process.env["DATABASE_URL"] ??
    "postgresql://alpacto:alpacto@localhost:5432/alpacto",
  redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  deepseek: {
    apiKey: process.env["DEEPSEEK_API_KEY"] ?? "",
    model: process.env["DEEPSEEK_MODEL"] ?? "deepseek-v4-flash",
    baseUrl: process.env["DEEPSEEK_BASE_URL"] ?? "https://api.deepseek.com",
  },
  openai: {
    apiKey: process.env["OPENAI_API_KEY"] ?? "",
    visionModel: process.env["OPENAI_VISION_MODEL"] ?? "gpt-5.6-luna",
  },
  chain: {
    alpactoContract: process.env["ALPACTO_CONTRACT_ADDRESS"] ?? "",
    rpcUrl:
      process.env["ARBITRUM_RPC_URL"] ??
      "https://sepolia-rollup.arbitrum.io/rpc",
  },
  ayni: {
    sessionKey: process.env["AYNI_SESSION_KEY"] ?? "",
    smartAccount: process.env["AYNI_SMART_ACCOUNT"] ?? "",
    useFixtureVision: process.env["AYNI_USE_FIXTURE_VISION"] !== "false",
  },
  s3: {
    endpoint: process.env["S3_ENDPOINT"] ?? "http://127.0.0.1:9000",
    region: process.env["S3_REGION"] ?? "us-east-1",
    bucket: process.env["S3_BUCKET"] ?? "alpacto-evidence",
    accessKey: process.env["S3_ACCESS_KEY"] ?? "alpacto",
    secretKey: process.env["S3_SECRET_KEY"] ?? "alpacto123",
  },
  zerodev: {
    projectId: process.env["ZERODEV_PROJECT_ID"] ?? "",
    bundlerRpc: process.env["ZERODEV_BUNDLER_RPC"] ?? "",
    paymasterRpc: process.env["ZERODEV_PAYMASTER_RPC"] ?? "",
  },
};

export const QUEUE_NAME = "alpacto-ayni-audit";
