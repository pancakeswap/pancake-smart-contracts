import { ethers, network } from "hardhat";
import config from "../../config";

const currentNetwork = network.name;

const main = async () => {
  console.info("Deploying to network:", currentNetwork);

  const _endBlock = "";
  const _tokenURI1 = "";
  const _tokenURI2 = "";
  const _tokenURI3 = "";
  const _numberPoints1 = "";
  const _numberPoints2 = "";
  const _numberPoints3 = "";
  const _campaignId1 = "";
  const _campaignId2 = "";
  const _campaignId3 = "";
  const _startLotteryRound = "";
  const _finalLotteryRound = "";

  const BunnySpecialLottery = await ethers.getContractFactory("BunnySpecialLottery");

  const bunnySpecialLottery = await BunnySpecialLottery.deploy(
    config.Lottery[currentNetwork],
    config.BunnyMintingStation[currentNetwork],
    config.PancakeProfile[currentNetwork],
    _endBlock,
    _tokenURI1,
    _tokenURI2,
    _tokenURI3,
    _numberPoints1,
    _numberPoints2,
    _numberPoints3,
    _campaignId1,
    _campaignId2,
    _campaignId3,
    _startLotteryRound,
    _finalLotteryRound
  );

  await bunnySpecialLottery.deployed();
  console.info("BunnySpecialLottery deployed to:", bunnySpecialLottery.address);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
