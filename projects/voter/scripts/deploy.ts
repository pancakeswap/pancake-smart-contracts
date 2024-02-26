import { ethers, network } from "hardhat";

const currentNetwork = network.name;

const main = async () => {
  console.log("Deploying to network:", currentNetwork);

  let ContractObj = await ethers.getContractFactory("GaugeVoting");
  let obj = await ContractObj.deploy(
    "0x5692DB8177a81A6c6afc8084C2976C9933EC1bAB" // veCake
  );
  await obj.deployed();
  console.log("GaugeVoting deployed to:", obj.address);

  ContractObj = await ethers.getContractFactory("GaugeVotingAdminUtil");
  obj = await ContractObj.deploy();
  await obj.deployed();
  console.log("GaugeVotingAdminUtil deployed to:", obj.address);

  ContractObj = await ethers.getContractFactory("GaugeVotingCalc");
  obj = await ContractObj.deploy();
  await obj.deployed();
  console.log("GaugeVotingCalc deployed to:", obj.address);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
