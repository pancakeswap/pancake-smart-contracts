import { ethers, run, network } from "hardhat";

async function main() {
  // Get network data from Hardhat config (see hardhat.config.ts).
  const networkName = network.name;
  // Check if the network is supported.
  if (networkName === "testnet" || networkName === "mainnet") {
    console.log(`Deploying to ${networkName} network...`);

    // Compile contracts.
    await run("compile");
    console.log("Compiled contracts...");

    const PancakeStableSwapThreePoolDeployer = await ethers.getContractFactory("PancakeStableSwapThreePoolDeployer");
    const pancakeStableSwapThreePoolDeployer = await PancakeStableSwapThreePoolDeployer.deploy();
    await pancakeStableSwapThreePoolDeployer.deployed();

    console.log("pancakeStableSwapThreePoolDeployer deployed to:", pancakeStableSwapThreePoolDeployer.address);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
