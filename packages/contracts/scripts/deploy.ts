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

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

/**
 * Phase 1 deploy: mock-usdc then alpacto-core.
 * your-contract is kept in-repo for Scaffold pipeline reference but is not redeployed here.
 */
export default async function deployScript(deployOptions: DeployOptions) {
  const config = getDeploymentConfig(deployOptions);

  console.log(`📡 Using endpoint: ${getRpcUrlFromChain(config.chain)}`);
  if (config.chain) {
    console.log(`🌐 Network: ${config.chain?.name}`);
    console.log(`🔗 Chain ID: ${config.chain?.id}`);
  }
  console.log(`🔑 Using private key: ${config.privateKey.substring(0, 10)}...`);
  console.log(`📁 Deployment directory: ${config.deploymentDir}`);
  console.log(`\n`);

  await deployStylusContract({
    contract: "mock-usdc",
    constructorArgs: [config.deployerAddress!],
    ...deployOptions,
  });

  const mockUsdc = getContractData(
    config.chain.id.toString(),
    "mock-usdc",
  );
  if (!mockUsdc?.address) {
    throw new Error("mock-usdc address missing after deploy");
  }

  await deployStylusContract({
    contract: "alpacto-core",
    constructorArgs: [config.deployerAddress!, mockUsdc.address],
    ...deployOptions,
  });

  console.log("\n\n");
  printDeployedAddresses(config.deploymentDir, config.chain.id.toString());
}
