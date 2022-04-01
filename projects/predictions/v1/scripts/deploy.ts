import { parseEther } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import config from "../config";

const main = async () => {
  // Get network data from Hardhat config (see hardhat.config.ts).
  const networkName = network.name;

  if (networkName === "mainnet") {
    if (!process.env.KEY_MAINNET) {
      throw new Error("Missing private key, refer to README 'Deployment' section");
    }
    if (!config.Admin[networkName] || config.Admin[networkName] === ethers.constants.AddressZero) {
      throw new Error("Missing admin address, refer to README 'Deployment' section");
    }
    if (!config.Operator[networkName] || config.Operator[networkName] === ethers.constants.AddressZero) {
      throw new Error("Missing operator address, refer to README 'Deployment' section");
    }
  }

  console.log("Deploying to network:", networkName);

  let oracle, admin, operator, intervalBlocks, bufferBlocks, minBetAmount, oracleUpdateAllowance;

  if (networkName === "mainnet") {
    console.info("YES");
    oracle = config.Oracle[networkName];
    admin = config.Admin[networkName];
    operator = config.Operator[networkName];
    intervalBlocks = config.IntervalBlocks[networkName];
    bufferBlocks = config.BufferBlocks[networkName];
    minBetAmount = config.MinBetAmount[networkName].toString();
    oracleUpdateAllowance = config.OracleUpdateAllowance[networkName];
  } else {
    console.log("Defaulting to bscTestnet config");
    admin = config.Admin["testnet"];
    operator = config.Operator["testnet"];
    intervalBlocks = config.IntervalBlocks["testnet"];
    bufferBlocks = config.BufferBlocks["testnet"];
    minBetAmount = config.MinBetAmount["testnet"].toString();
    oracleUpdateAllowance = config.OracleUpdateAllowance["testnet"];

    console.log("Deploying mocks");
    const OracleContract = await ethers.getContractFactory("MockAggregatorV3");
    oracle = await OracleContract.deploy(8, 100); // 8 decimals, $100 (8 decimals)
    oracle = oracle.address;
    console.log("Oracle deployed to:", oracle);
  }

  console.log("Deploying prediction");
  const BnbPricePrediction = await ethers.getContractFactory("BnbPricePrediction");
  const prediction = await BnbPricePrediction.deploy(
    oracle,
    admin,
    operator,
    intervalBlocks,
    bufferBlocks,
    parseEther(minBetAmount),
    oracleUpdateAllowance
  );
  console.log("BnbPricePrediction deployed to:", prediction.address);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
