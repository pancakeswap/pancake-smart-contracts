import { ethers, network, run } from "hardhat";
import { parseEther } from "ethers/lib/utils";
import config from "../config";

const main = async () => {
  // Get network name: hardhat, testnet or mainnet.
  const { name } = network;
  console.log(`Deploying to ${name} network...`);

  // Compile contracts.
  await run("compile");
  console.log("Compiled contracts!");

  const IFOV2 = await ethers.getContractFactory("IFOV2");

  if (name == "mainnet") {
    const ifoV2 = await IFOV2.deploy(
      config.LPToken[name],
      config.OfferingToken[name],
      config.PancakeProfile[name],
      config.StartBlock[name],
      config.EndBlock[name],
      config.AdminAddress[name]
    );

    await ifoV2.deployed();
    console.log("IFOV2 deployed to:", ifoV2.address);
  } else if (name == "testnet") {
    const MockBEP20 = await ethers.getContractFactory("MockBEP20");
    const offeringToken = await MockBEP20.deploy("Offering Coin", "OC", parseEther("10000000"));

    await offeringToken.deployed();
    console.log("OC32 token deployed to:", offeringToken.address);

    const ifoV2 = await IFOV2.deploy(
      config.LPToken[name],
      offeringToken.address,
      config.PancakeProfile[name],
      config.StartBlock[name],
      config.EndBlock[name],
      config.AdminAddress[name]
    );

    await ifoV2.deployed();
    console.log("IFOV2 deployed to:", ifoV2.address);
  }
};
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
