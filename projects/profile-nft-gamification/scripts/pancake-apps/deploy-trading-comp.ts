import { ethers, network } from "hardhat";
import config from "../../config";

const currentNetwork = network.name;

const main = async () => {
  console.log("Deploying to network:", currentNetwork);

  const TradingCompV1 = await ethers.getContractFactory("TradingCompV1");

  const tradingComp = await TradingCompV1.deploy(
    config.PancakeProfile[currentNetwork],
    config.BunnyMintingStation[currentNetwork],
    config.CakeToken[currentNetwork]
  );

  await tradingComp.deployed();
  console.log("TradingCompV1 deployed to:", tradingComp.address);
};
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
