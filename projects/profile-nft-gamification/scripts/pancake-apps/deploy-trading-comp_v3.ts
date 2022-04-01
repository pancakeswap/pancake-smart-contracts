import { ethers, network } from "hardhat";
import config from "../../config";

const currentNetwork = network.name;

const main = async () => {
  console.log("Deploying to network:", currentNetwork);

  const TradingCompV3 = await ethers.getContractFactory("TradingCompV3");

  const tradingComp = await TradingCompV3.deploy(
    config.PancakeProfile[currentNetwork],
    config.BunnyMintingStation[currentNetwork],
    config.CakeToken[currentNetwork],
    config.MoboxToken[currentNetwork],
    config.MoboxKeyToken[currentNetwork],
    3
  );

  await tradingComp.deployed();
  console.log("TradingCompV3 deployed to:", tradingComp.address);
};
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
