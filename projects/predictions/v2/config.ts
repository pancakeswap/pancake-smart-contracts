export default {
  Address: {
    Oracle: {
      mainnet: "0xD276fCF34D54A926773c399eBAa772C12ec394aC",
      testnet: "0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526",
    },
    Admin: {
      mainnet: "0x0000000000000000000000000000000000000000",
      testnet: "0x0000000000000000000000000000000000000000",
    },
    Operator: {
      mainnet: "0x0000000000000000000000000000000000000000",
      testnet: "0x0000000000000000000000000000000000000000",
    },
  },
  Block: {
    Interval: {
      mainnet: 300,
      testnet: 300,
    },
    Buffer: {
      mainnet: 15,
      testnet: 15,
    },
  },
  Treasury: {
    mainnet: 300, // 3%
    testnet: 1000, // 10%
  },
  BetAmount: {
    mainnet: 0.001,
    testnet: 0.001,
  },
  OracleUpdateAllowance: {
    mainnet: 300,
    testnet: 300,
  },
};
