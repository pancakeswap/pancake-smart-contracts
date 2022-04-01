import { ethers, network, run } from "hardhat";

const main = async () => {
  // Get network name: hardhat, testnet or mainnet.
  const { name } = network;
  if (name == "mainnet" || name == "testnet") {
    console.log(`Deploying to ${name} network...`);

    // Compile contracts.
    await run("compile");
    console.log("Compiled contracts");

    const CoinFactory = await ethers.getContractFactory("CoinFactory");
    const coinFactory = await CoinFactory.deploy();

    await coinFactory.deployed();
    console.log("CoinFactory deployed to:", coinFactory.address);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
