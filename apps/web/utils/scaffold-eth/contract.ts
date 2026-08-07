import type { Abi, Address } from "viem";

/**
 * Minimal contract registry types used by `contracts/deployedContracts.ts`
 * (written by `yarn export-abi` / deploy tooling).
 */
export type GenericContract = {
  address: Address;
  abi: Abi;
  inheritedFunctions?: { readonly [key: string]: string };
  external?: true;
  deployedOnBlock?: number;
};

export type GenericContractsDeclaration = {
  [chainId: number]: {
    [contractName: string]: GenericContract;
  };
};
