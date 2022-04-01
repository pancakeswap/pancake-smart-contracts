import { ethers, network } from "hardhat";
import { parseEther } from "ethers/lib/utils";
import config from "../../config";

const currentNetwork = network.name;

const main = async () => {
  console.log("Deploying to network:", currentNetwork);

  const _tokenPrice = parseEther("4");
  const _ipfsHash = "";
  const _startBlockTime = "";

  const BunnyMintingStation = await ethers.getContractFactory("BunnyMintingStation");

  const bunnyMintingStation = await BunnyMintingStation.deploy(config.PancakeBunnies[currentNetwork]);

  await bunnyMintingStation.deployed();
  console.log("BunnyMintingStation deployed to:", bunnyMintingStation.address);

  const BunnyFactoryV3 = await ethers.getContractFactory("BunnyFactoryV3");

  const bunnyFactory = await BunnyFactoryV3.deploy(
    config.BunnyFactoryV2[currentNetwork],
    bunnyMintingStation.address,
    config.CakeToken[currentNetwork],
    _tokenPrice,
    _ipfsHash,
    _startBlockTime
  );

  await bunnyFactory.deployed();
  console.log("BunnyFactoryV3 deployed to:", bunnyFactory.address);

  await bunnyFactory.setBunnyJson("sleepy.json", "dollop.json", "twinkle.json", "churro.json", "sunny.json");

  const MINTER_ROLE = await bunnyMintingStation.MINTER_ROLE();
  await bunnyMintingStation.grantRole(MINTER_ROLE, bunnyFactory);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
