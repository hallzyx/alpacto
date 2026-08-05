import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

function parseBigIntEnv(key: string, fallback: bigint): bigint {
  const raw = process.env[key];
  if (!raw || raw.trim() === "") return fallback;
  return BigInt(raw);
}

export const config = {
  port: Number(process.env["PORT"] ?? 4000),
  host: process.env["HOST"] ?? "0.0.0.0",
  appUrl: process.env["APP_URL"] ?? "http://localhost:3000",
  apiUrl: process.env["API_URL"] ?? "http://localhost:4000",
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
  stripe: {
    secretKey: process.env["STRIPE_SECRET_KEY"] ?? "",
    webhookSecret: process.env["STRIPE_WEBHOOK_SECRET"] ?? "",
    priceMode: process.env["STRIPE_PRICE_MODE"] ?? "demo",
  },
  chain: {
    chainId: Number(process.env["CHAIN_ID"] ?? 421614),
    rpcUrl:
      process.env["ARBITRUM_RPC_URL"] ??
      "https://sepolia-rollup.arbitrum.io/rpc",
    alpactoContract: process.env["ALPACTO_CONTRACT_ADDRESS"] ?? "",
    usdcToken:
      process.env["USDC_TOKEN_ADDRESS"] ??
      "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    treasuryPrivateKey: process.env["TREASURY_PRIVATE_KEY"] ?? "",
    demoBuyerAddress: process.env["DEMO_BUYER_SMART_ACCOUNT"] ?? "",
    demoAssociationAddress: process.env["DEMO_ASSOCIATION_SMART_ACCOUNT"] ?? "",
  },
  demo: {
    maxFundingUsdc: parseBigIntEnv("DEMO_MAX_FUNDING_USDC", 10_000n),
  },
  deepseek: {
    apiKey: process.env["DEEPSEEK_API_KEY"] ?? "",
    model: process.env["DEEPSEEK_MODEL"] ?? "deepseek-v4-flash",
    baseUrl: process.env["DEEPSEEK_BASE_URL"] ?? "https://api.deepseek.com",
  },
};
