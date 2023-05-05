import type { HardhatUserConfig, NetworkUserConfig } from "hardhat/types";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-truffle5";
import "hardhat-abi-exporter";
import "hardhat-contract-sizer";
import "solidity-coverage";
import "dotenv/config";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    // testnet: bscTestnet,
    // mainnet: bscMainnet,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      }
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  }
};

export default config;
