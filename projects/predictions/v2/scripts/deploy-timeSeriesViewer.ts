import { ethers, network, run } from "hardhat";

const main = async () => {
  // Get network data from Hardhat config.
  const networkName = network.name;

  // Check if the network is supported.
  if (networkName === "testnet" || networkName === "mainnet") {
    console.log(`Deploying to ${networkName} network...`);

    // Compile contracts.
    await run("compile");
    console.log("Compiled contracts. Deploying...");

    // Deploy contracts.
    const TimeSeriesViewer = await ethers.getContractFactory("TimeSeriesViewer");
    const contract = await TimeSeriesViewer.deploy();

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
