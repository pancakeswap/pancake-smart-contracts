# BunnyFactoryV2

This document explains how the `BunnyFactoryV2` contract works.

`BunnyFactoryV2` inherits from [`Ownable`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Owanable.sol). Hence, it also inherits from [`Context`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Context.sol).

## 1. Variables

### Public variables

#### Numeric variables (uint256)

- `startBlockNumber`: starting block for minting bunnies (can be updated)
- `endBlockNumber`: end block number to get collectibles (can be extended)
- `tokenPrice`: price in CAKE (w/ 18 decimals) to mint a NFT

#### Mappings

- `hasClaimed`: checks whether a user has claimed. If false, he can claim (and pay the price)

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

- `mintNFT(_tokenId)`: mint a new NFT (with `_tokenId` from 5-9)

## 3. Events

```
event BunnyMint(
    address indexed to,
    uint256 indexed tokenId,
    uint8 indexed bunnyId
);
```

It indicates that a new bunny was minted.
