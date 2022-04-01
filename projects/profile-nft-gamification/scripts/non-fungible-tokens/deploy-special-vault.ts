import { ethers, network } from "hardhat";
import config from "../../config";

const currentNetwork = network.name;

const main = async () => {
  console.log("Deploying to network:", currentNetwork);

  const _thresholdTimeStamp = "";
  const _endBlock = "";
  const _numberPoints = "";
  const _campaignId = "";
  const _tokenURI = "";

  const BunnySpecialCakeVault = await ethers.getContractFactory("BunnySpecialCakeVault");

  const bunnySpecialCakeVault = await BunnySpecialCakeVault.deploy(
    config.CakeVault[currentNetwork],
    config.BunnyMintingStation[currentNetwork],
    config.PancakeProfile[currentNetwork],
    _endBlock,
    _thresholdTimeStamp,
    _numberPoints,
    _campaignId,
    _tokenURI
  );

  await bunnySpecialCakeVault.deployed();
  console.log("BunnySpecialCakeVault deployed to:", bunnySpecialCakeVault.address);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
