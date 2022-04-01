import { ethers, network } from "hardhat";
import config from "../../config";

const currentNetwork = network.name;

const main = async () => {
  console.log("Deploying to network:", currentNetwork);

  const TradingCompV2 = await ethers.getContractFactory("TradingCompV2");

  const tradingComp = await TradingCompV2.deploy(
    config.PancakeProfile[currentNetwork],
    config.BunnyMintingStation[currentNetwork],
    config.CakeToken[currentNetwork],
    config.LazioToken[currentNetwork],
    config.PortoToken[currentNetwork],
    config.SantosToken[currentNetwork],
    2
  );

  await tradingComp.deployed();
  console.log("TradingCompV2 deployed to:", tradingComp.address);
};
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
