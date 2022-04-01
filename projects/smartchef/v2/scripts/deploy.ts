import { ethers, network } from "hardhat";
import { parseEther } from "ethers/lib/utils";

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

  let rewardTokenAddress: string;

  if (currentNetwork == "testnet") {
    const MockBEP20 = await ethers.getContractFactory("MockBEP20");
    const rewardToken = await MockBEP20.deploy("Pool Token 1", "PT1", parseEther("800000"));
    rewardTokenAddress = rewardToken.address;
    console.log("RewardToken deployed to:", rewardTokenAddress);
  } else if (currentNetwork == "mainnet") {
    rewardTokenAddress = config.RewardToken[currentNetwork];
  }

  console.log("Deploying SmartChef...");

  const SmartChef = await ethers.getContractFactory("SmartChef");

  const smartChef = await SmartChef.deploy(
    config.StakedToken[currentNetwork],
    rewardTokenAddress,
    String(parseEther(config.RewardPerBlock[currentNetwork])),
    config.StartBlock[currentNetwork],
    config.EndBlock[currentNetwork],
    String(parseEther(config.PoolLimitPerUser[currentNetwork]))
  );

  console.log("SmartChef deployed to:", smartChef.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
