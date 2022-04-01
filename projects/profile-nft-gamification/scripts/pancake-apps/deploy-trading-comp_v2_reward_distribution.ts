import { ethers, network } from "hardhat";
import config from "../../config";

const currentNetwork = network.name;

const main = async () => {
  console.log("Deploying to network:", currentNetwork);

  const TradingCompV2RewardDistribution = await ethers.getContractFactory("TradingCompV2RewardDistribution");

  const tradingComp = await TradingCompV2RewardDistribution.deploy(
    config.PancakeProfile[currentNetwork],
    config.BunnyMintingStation[currentNetwork],
    config.CakeToken[currentNetwork],
    config.LazioToken[currentNetwork],
    config.PortoToken[currentNetwork],
    config.SantosToken[currentNetwork],
    config.TradingCompV2[currentNetwork]
  );

  await tradingComp.deployed();
  console.log("TradingCompV2RewardDistribution deployed to:", tradingComp.address);
};
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
