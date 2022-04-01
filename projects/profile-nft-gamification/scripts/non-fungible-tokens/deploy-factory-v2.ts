import { ethers, network } from "hardhat";
import { parseEther } from "ethers/lib/utils";
import config from "../../config";

const currentNetwork = network.name;

const main = async () => {
  console.log("Deploying to network:", currentNetwork);

  const _tokenPrice = parseEther("4");
  const _ipfsHash = "";
  const _startBlockTime = "";
  const _endBlockTime = "";

  const BunnyFactoryV2 = await ethers.getContractFactory("BunnyFactoryV2");

  const bunnyFactory = await BunnyFactoryV2.deploy(
    config.PancakeBunnies[currentNetwork],
    config.CakeToken[currentNetwork],
    _tokenPrice,
    _ipfsHash,
    _startBlockTime,
    _endBlockTime
  );

  await bunnyFactory.deployed();
  console.log("BunnyFactoryV2 deployed to:", bunnyFactory.address);

  await bunnyFactory.setBunnyNames("Sleepy", "Dollop", "Twinkle", "Churro", "Sunny");
  await bunnyFactory.setBunnyJson("sleepy.json", "dollop.json", "twinkle.json", "churro.json", "sunny.json");
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
