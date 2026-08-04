import deployStylusContract from "./deploy_contract";
import {
  getDeploymentConfig,
  getRpcUrlFromChain,
  printDeployedAddresses,
  getContractData,
} from "./utils/";
import { DeployOptions } from "./utils/type";
import { config as dotenvConfig } from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { arbitrumSepolia } from "viem/chains";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

/** Also load monorepo root .env for USDC_TOKEN_ADDRESS etc. */
const rootEnv = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(rootEnv)) {
  dotenvConfig({ path: rootEnv });
}

/**
 * Local (Nitro): mock-usdc then alpacto-core.
 * Sepolia: alpacto-core only with Circle USDC from env.
 */
export default async function deployScript(deployOptions: DeployOptions) {
  const config = getDeploymentConfig(deployOptions);
  const isSepolia = config.chain.id === arbitrumSepolia.id;

  console.log(`📡 Using endpoint: ${getRpcUrlFromChain(config.chain)}`);
  if (config.chain) {
    console.log(`🌐 Network: ${config.chain?.name}`);
    console.log(`🔗 Chain ID: ${config.chain?.id}`);
  }
  console.log(`🔑 Using private key: ${config.privateKey.substring(0, 10)}...`);
  console.log(`📁 Deployment directory: ${config.deploymentDir}`);
  console.log(`\n`);

  let usdcAddress: string;

  if (isSepolia) {
    usdcAddress =
      process.env["USDC_TOKEN_ADDRESS"] ||
      "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
    console.log(`💵 Using Circle USDC on Sepolia: ${usdcAddress}`);
  } else {
    await deployStylusContract({
      contract: "mock-usdc",
      constructorArgs: [config.deployerAddress!],
      ...deployOptions,
    });

    const mockUsdc = getContractData(config.chain.id.toString(), "mock-usdc");
    if (!mockUsdc?.address) {
      throw new Error("mock-usdc address missing after deploy");
    }
    usdcAddress = mockUsdc.address;
  }

  await deployStylusContract({
    contract: "alpacto-core",
    constructorArgs: [config.deployerAddress!, usdcAddress],
    ...deployOptions,
  });

  console.log("\n\n");
  printDeployedAddresses(config.deploymentDir, config.chain.id.toString());

  if (isSepolia) {
    const core = getContractData(config.chain.id.toString(), "alpacto-core");
    if (core?.address) {
      console.log(`\n📌 Set in root .env:\nALPACTO_CONTRACT_ADDRESS=${core.address}`);
    }
  }
}
