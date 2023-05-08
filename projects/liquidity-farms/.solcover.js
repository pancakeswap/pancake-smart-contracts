// Contracts are compiled without optimization
// and with gas estimation distortion
// https://github.com/sc-forks/solidity-coverage/blob/master/HARDHAT_README.md#usage

module.exports = {
  skipFiles: [
    "libs/CoinFactory.sol",
    "libs/MockBEP20.sol",
    "libs/MockCoin.sol",
    "libs/MockERC20.sol",
    "libs/WBNB.sol",
    "BnbStaking.sol",
    "CakeToken.sol",
    "LotteryRewardPool.sol",
    "MasterChef.sol",
    "SousChef.sol",
    "SyrupBar.sol",
    "Timelock.sol",
  ],
  measureStatementCoverage: false,
  measureFunctionCoverage: true,
};
