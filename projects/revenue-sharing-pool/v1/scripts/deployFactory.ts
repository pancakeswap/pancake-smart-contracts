import { parseEther } from "ethers/lib/utils";
import { ethers, network, run } from "hardhat";
import config from "../config";

const main = async () => {
  // Get network data from Hardhat config (see hardhat.config.ts).
  const networkName = network.name;

  // Check if the network is supported.
  if (networkName === "testnet" || networkName === "mainnet") {
    console.log(`Deploying to ${networkName} network...`);

    // Check if the addresses in the config are set.
    if (config.VCake[networkName] === ethers.constants.AddressZero) {
      throw new Error("Missing addresses");
    }

    // Compile contracts.
    await run("compile");
    console.log("Compiled contracts...");

    // Deploy contracts.
    const RevenueSharingPoolFactoryContract = await ethers.getContractFactory("RevenueSharingPoolFactory");
    const contract = await RevenueSharingPoolFactoryContract.deploy(config.VCake[networkName]);

    // Wait for the contract to be deployed before exiting the script.
    await contract.deployed();
    console.log(`Deployed to ${contract.address}`);
  } else {
    console.log(`Deploying to ${networkName} network is not supported...`);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
