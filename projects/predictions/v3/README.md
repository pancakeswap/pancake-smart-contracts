# Pancake Prediction With Chainlink Oracle

## Description

Pancakeswap Prediction with Chainlink Oracle

## Documentation

## Oracle Price Feed (Chainlink)

- https://docs.chain.link/docs/price-feeds-api-reference
- https://docs.chain.link/docs/binance-smart-chain-addresses
- https://github.com/smartcontractkit/chainlink

### Cake/USD

- Mainnet: 0xB6064eD41d4f67e353768aA239cA86f4F73665a1
- Testnet: 0x81faeDDfeBc2F8Ac524327d70Cf913001732224C

## Deployment

Verify that `config.js` has the correct information
Uncomment private key usage lines in `hardhat.config.js` (line 44, 49)

```
export KEY_MAINNET=PRIVATE_KEY
yarn migrate:[network]
```

### Operation

When a round is started, the round's `lockBlock` and `closeBlock` would be set.

`lockBlock` = current block + `intervalBlocks`

`closeBlock` = current block + (`intervalBlocks` \* 2)

## Kick-start Rounds

The rounds are always kick-started with:

```
startGenesisRound()
(wait for x blocks)
lockGenesisRound()
(wait for x blocks)
executeRound()
```

## Continue Running Rounds

```
executeRound()
(wait for x blocks)
executeRound()
(wait for x blocks)
```

## Resuming Rounds

After errors like missing `executeRound()` etc.

```
pause()
(Users can't bet, but still is able to withdraw)
unpause()
startGenesisRound()
(wait for x blocks)
lockGenesisRound()
(wait for x blocks)
executeRound()
```

## Common Errors

Refer to `test/prediction.test.js`

## Architecture Illustration

### Normal Operation

![normal](images/normal-round.png)

### Missing Round Operation

![missing](images/missing-round.png)
