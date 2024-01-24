import { ethers, network, run } from "hardhat";
import config from "../config";

const main = async () => {
  // Get network name: hardhat, testnet or mainnet.
  const { name } = network;
  console.log(`Deploying to ${name} network...`);

  // Compile contracts.
  await run("compile");
  console.log("Compiled contracts!");

  const IFOV2 = await ethers.getContractFactory("IFOV2");

  if (name === "mainnet") {
    const ifoV2 = await IFOV2.deploy(
      config.LPToken[name],
      config.OfferingToken[name],
      config.StartBlock[name],
      config.EndBlock[name],
      config.AdminAddress[name]
    );

    await ifoV2.deployed();
    console.log("IFOV2 deployed to:", ifoV2.address);
  } else if (name === "testnet") {
    console.log("ethers.js version", ethers.version);
    const offeringTokenAddress = "0x7A7CA1830fbf7257669C2eee763E03081bc1fc85";
    const ifoV2Address = "0x2247E2B8182D7A785dAE88Cd7191378a0112ff0B";

    const MockBEP20 = await ethers.getContractFactory("MockERC20");
    const offeringToken = MockBEP20.attach(offeringTokenAddress);
    const ifoV2 = IFOV2.attach(ifoV2Address);

    // IFO Pool 0 private pool
    // 200_000 offering token
    const offeringAmountPool0 = ethers.utils.parseEther("200000");
    // 1000 weth
    const raisingAmountPool0 = ethers.utils.parseEther("200");

    // Transfer the offering total amount to the IFO contract

    await offeringToken.transfer(ifoV2.address, offeringAmountPool0);

    // Pool 0 is set
    await ifoV2.setPool(
      offeringAmountPool0,
      raisingAmountPool0,
      "0",
      false, // tax
      "1",
      false,
      "0xcd65d3e99182be89d33618d7fac3456c24aa1af1a5e078f5f0f4513505ef65c9",
      { gasLimit: 1000000 }
    );

    // IFO Pool 1 public pool
    // 800_000 offering token
    const offeringAmountPool1 = ethers.utils.parseEther("800000");
    // 800 weth
    const raisingAmountPool1 = ethers.utils.parseEther("800");

    // Transfer the offering total amount to the IFO contract
    await offeringToken.transfer(ifoV2.address, offeringAmountPool1);

    // Pool 1 is set
    await ifoV2.setPool(
      offeringAmountPool1,
      raisingAmountPool1,
      "0",
      false, // tax
      "0",
      true,
      ethers.constants.HashZero,
      { gasLimit: 1000000 }
    );
  }
};
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
