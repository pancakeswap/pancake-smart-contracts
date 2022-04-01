import { ethers, network } from "hardhat";
import config from "../../config";

const currentNetwork = network.name;

const main = async () => {
  console.log("Deploying to network:", currentNetwork);

  const _thresholdRound = "";
  const _endBlock = "";
  const _numberPoints = "";
  const _campaignId = "";
  const _tokenURI = "";

  const BunnySpecialPrediction = await ethers.getContractFactory("BunnySpecialPrediction");

  const bunnySpecialPrediction = await BunnySpecialPrediction.deploy(
    config.CakeVault[currentNetwork],
    config.BunnyMintingStation[currentNetwork],
    config.PancakeProfile[currentNetwork],
    _endBlock,
    _thresholdRound,
    _numberPoints,
    _campaignId,
    _tokenURI
  );

  await bunnySpecialPrediction.deployed();
  console.log("BunnySpecialPrediction deployed to:", bunnySpecialPrediction.address);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
