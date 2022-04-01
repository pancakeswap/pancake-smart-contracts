import { ethers, network, run } from "hardhat";
import config from "../config";

const main = async () => {
  // Get network name: hardhat, testnet or mainnet.
  const { name } = network;
  console.log(`Deploying to ${name} network...`);

  // Compile contracts.
  await run("compile");
  console.log("Compiled contracts...");

  // Deploy contracts.
  const FarmAuction = await ethers.getContractFactory("FarmAuction");
  const contract = await FarmAuction.deploy(config.Cake[name], config.Operator[name], config.AuctionLength[name]);

  // Wait for the contract to be deployed before exiting the script.
  await contract.deployed();
  console.log(`Deployed to ${contract.address}`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
