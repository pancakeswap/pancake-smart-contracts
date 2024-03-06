import { ethers, run, network } from "hardhat";
import config from "../config";

async function main() {
  // Get network data from Hardhat config (see hardhat.config.ts).
  const networkName = network.name;
  // Check if the network is supported.
  if (networkName === "testnet" || networkName === "mainnet") {
    console.log(`Deploying to ${networkName} network...`);

    // Compile contracts.
    await run("compile");
    console.log("Compiled contracts...");

    const FarmBooster = await ethers.getContractFactory("FarmBooster");
    const farmBooster = await FarmBooster.deploy(
      config.VECake[networkName],
      config.MasterChefV3[networkName],
      config.CA[networkName],
      config.CB[networkName]
    );
    await farmBooster.deployed();

    console.log("farmBooster deployed to:", farmBooster.address);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
