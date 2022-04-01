export default {
  Address: {
    Token: {
      mainnet: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
      testnet: "0x2864f1d6e60198b67fbe8072c3a5586be0f44b72",
    },
    Oracle: {
      mainnet: "0xB6064eD41d4f67e353768aA239cA86f4F73665a1",
      testnet: "0x81faeDDfeBc2F8Ac524327d70Cf913001732224C",
    },
    Admin: {
      mainnet: "0x1a5238878B2c138B9DCCe2ea6BE9CF7e9F12Cf6a",
      testnet: "0x1a5238878B2c138B9DCCe2ea6BE9CF7e9F12Cf6a",
    },
    Operator: {
      mainnet: "0x41519446C09D5DB80025B2ABbcbB3CF2Cf0022D0",
      testnet: "0x41519446C09D5DB80025B2ABbcbB3CF2Cf0022D0",
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
