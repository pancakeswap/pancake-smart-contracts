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

    const PancakeStableSwapFactory = await ethers.getContractFactory("PancakeStableSwapFactory");
    const pancakeStableSwapFactory = await PancakeStableSwapFactory.deploy(
      config.LPFactory[networkName],
      config.SwapTwoPoolDeployer[networkName],
      config.SwapThreePoolDeployer[networkName]
    );
    await pancakeStableSwapFactory.deployed();

    console.log("pancakeStableSwapFactory deployed to:", pancakeStableSwapFactory.address);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
