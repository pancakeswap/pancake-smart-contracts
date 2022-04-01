import { ethers, network } from "hardhat";
import config from "../../config";

const currentNetwork = network.name;

const main = async () => {
  console.log("Deploying to network:", currentNetwork);

  const _maxViewLength = "10";

  const PointCenterIFO = await ethers.getContractFactory("PointCenterIFO");

  const pointCenterIFO = await PointCenterIFO.deploy(config.PancakeProfile[currentNetwork], _maxViewLength);

  await pointCenterIFO.deployed();
  console.log("PointCenterIFO deployed to:", pointCenterIFO.address);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
