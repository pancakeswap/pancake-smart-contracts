import { constants } from "@openzeppelin/test-helpers";

import { ethers, network, run } from "hardhat";
import config from "../config";

const main = async () => {
  // Get network name: hardhat, testnet or mainnet.
  const { name } = network;

  if (name == "mainnet") {
    if (!process.env.KEY_MAINNET) {
      throw new Error("Missing private key, refer to README 'Deployment' section");
    }
  }

  if (!config.CakeVault[name] || config.CakeVault[name] === constants.ZERO_ADDRESS) {
    throw new Error("Missing cake address, refer to README 'Deployment' section");
  }

  console.log("Deploying to network:", network);

  console.log("Deploying Vault Owner..");

  const VaultOwner = await ethers.getContractFactory("VaultOwner");
  const vaultOwner = await VaultOwner.deploy(config.CakeVault[name]);

  await vaultOwner.deployed();

  console.log("VaultOwner deployed to:", vaultOwner.address);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
