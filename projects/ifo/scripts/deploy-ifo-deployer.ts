import { ethers, network, run } from "hardhat";
import config from "../config";

const main = async () => {
  // Get network name: hardhat, testnet or mainnet.
  const { name } = network;
  if (name == "mainnet" || name == "testnet") {
    console.log(`Deploying to ${name} network...`);

    // Compile contracts.
    await run("compile");
    console.log("Compiled contracts");

    const IFODeployer = await ethers.getContractFactory("IFODeployer");
    const ifoDeployer = await IFODeployer.deploy(config.PancakeProfile[name]);

    await ifoDeployer.deployed();
    console.log("IFODeployer deployed to:", ifoDeployer.address);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
