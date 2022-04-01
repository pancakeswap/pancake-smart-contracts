import { ethers, network } from "hardhat";
import config from "../../config";

const currentNetwork = network.name;

const main = async () => {
  console.log("Deploying to network:", currentNetwork);

  const _thresholdUser = "";
  const _endBlock = "";

  const BunnySpecialV2 = await ethers.getContractFactory("BunnySpecialV2");

  const bunnySpecialV2 = await BunnySpecialV2.deploy(
    config.BunnyMintingStation[currentNetwork],
    config.CakeToken[currentNetwork],
    config.PancakeProfile[currentNetwork],
    _thresholdUser,
    _endBlock
  );

  await bunnySpecialV2.deployed();
  console.log("BunnySpecialV2 deployed to:", bunnySpecialV2.address);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
