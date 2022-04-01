import { ethers, network } from "hardhat";
import config from "../../config";

const currentNetwork = network.name;

const main = async () => {
  console.log("Deploying to network:", currentNetwork);

  const _ipfsURIBunny10 = "";
  const _ipfsURIBunny11 = "";
  const _maxViewLength = "10";
  const _thresholdBunny10 = "";
  const _thresholdBunny11 = "";

  const BunnySpecialV1 = await ethers.getContractFactory("BunnySpecialV1");

  const bunnySpecialV1 = await BunnySpecialV1.deploy(
    config.BunnyMintingStation[currentNetwork],
    config.CakeToken[currentNetwork],
    config.PancakeProfile[currentNetwork],
    _maxViewLength
  );

  await bunnySpecialV1.deployed();
  console.log("BunnySpecialV1 deployed to:", bunnySpecialV1.address);

  await bunnySpecialV1.addBunny("10", _ipfsURIBunny10, _thresholdBunny10, "0");
  await bunnySpecialV1.addBunny("11", _ipfsURIBunny11, _thresholdBunny11, "0");
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
