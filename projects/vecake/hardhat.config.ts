import type { HardhatUserConfig, NetworkUserConfig } from "hardhat/types";
import "@nomiclabs-2.2.2/hardhat-ethers";
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-truffle5";
import "hardhat-abi-exporter";
import "hardhat-contract-sizer";
import "solidity-coverage";
import "dotenv/config";

const bscTestnet: NetworkUserConfig = {
  url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
  chainId: 97,
  accounts: [process.env.KEY_TESTNET!],
};

const bscMainnet: NetworkUserConfig = {
  url: "https://bsc-dataseed.binance.org/",
  chainId: 56,
  accounts: [process.env.KEY_MAINNET!],
};

const config = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    // testnet: bscTestnet,
    // mainnet: bscMainnet,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 99999,
          },
        },
      },
      {
        version: "0.8.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 99999,
          },
        },
      },
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 99999,
          },
        },
      },
    ],
    overrides: {
      "contracts/VECake.sol": {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 9,
          },
        },
      },
      "contracts/test/VECakeTest.sol": {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 9,
          },
        },
      },
    },
  },
  paths: {
    sources: "./contracts/",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
