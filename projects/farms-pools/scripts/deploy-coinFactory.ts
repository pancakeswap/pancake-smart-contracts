import { ethers, network } from "hardhat";

const config = require("../config");
const currentNetwork = network.name;

async function main() {
  if (currentNetwork == "mainnet") {
    if (!process.env.KEY_MAINNET) {
      throw new Error("Missing private key, refer to README 'Deployment' section");
    }
    if (
      !config.Admin[currentNetwork] ||
      config.Admin[currentNetwork] === "0x0000000000000000000000000000000000000000"
    ) {
      throw new Error("Missing admin address, refer to README 'Deployment' section");
    }
  }

  console.log("Deploying to network:", currentNetwork);

  console.log("Deploying Coin Factory...");

  const CoinFactory = await ethers.getContractFactory("CoinFactory");
  const coinFactory = await CoinFactory.deploy();

  console.log("CoinFactory deployed to:", coinFactory.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
