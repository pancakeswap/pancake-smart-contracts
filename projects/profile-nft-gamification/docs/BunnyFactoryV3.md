# BunnyFactoryV3

This document explains how the `BunnyFactoryV3` contract works.

`BunnyFactoryV3` inherits from [`Ownable`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Owanable.sol). Hence, it also inherits from [`Context`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Context.sol).

## 1. Variables

### Public variables

#### Numeric variables (uint256)

- `startBlockNumber`: starting block for minting bunnies (can be updated)
- `tokenPrice`: price in CAKE (w/ 18 decimals) to mint a NFT

#### Mappings

- `hasClaimed`: checks whether a user has claimed for this contract.

### Private variables

#### Numeric variables (uint8)

- `previousNumberBunnyIds`: number of series before (5)
- `numberBunnyIds`: number of total visuals (10)

#### String variables

- `ipfsHash`: IPFS hash for json files with metadata

#### Mappings

- `bunnyIdURIs`: maps the bunnyId to the respective token URI for the minting function

## 2. Functions

Note: all functions that are not inherited are external.

### Users

- `mintNFT(_tokenId)`: mint a new NFT (with `_tokenId` from 5-9). It is only possible if the user has NOT claimed in V2 or V3 (i.e. this contract).

### Owner

- `claimFee(_amount)`: retrieve the CAKE from the contract
- `setBunnyJson()`: set the bunny json for metadata (e.g. dollop.json) of each bunnyId
- `setStartBlockNumber(_newStartBlockNumber)`: set the start number
- `updateTokenPrice(_newTokenPrice)`: update the token price

### View

- `canMint(userAddress)`: it checks whether an address can mint based on whether the individual has claimed in V2 or V3.

## 3. Events

```
event BunnyMint(
    address indexed to,
    uint256 indexed tokenId,
    uint8 indexed bunnyId
);
```

It indicates when a new bunny is minted.
