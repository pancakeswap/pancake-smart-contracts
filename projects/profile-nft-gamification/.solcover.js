// Contracts are compiled without optimization
// and with gas estimation distortion
// https://github.com/sc-forks/solidity-coverage/blob/master/HARDHAT_README.md#usage

module.exports = {
  skipFiles: [
    "IPancakeProfile.sol",
    "test/CakeToken.sol",
    "test/MasterChef.sol",
    "test/SyrupBar.sol",
    "utils/IFO.sol",
    "utils/MockAdmin.sol",
    "utils/MockBEP20.sol",
    "utils/MockBunnies.sol",
    "utils/MockCats.sol",
    "old/BunnyFactoryV2.sol",
    "old/BunnyMintingFarm.sol",
  ],
  measureStatementCoverage: false,
  measureFunctionCoverage: true,
};
