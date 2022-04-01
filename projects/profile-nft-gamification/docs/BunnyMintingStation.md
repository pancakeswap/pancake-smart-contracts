# BunnyMintingStation

This document explains how the `BunnyMintingStation` contract works. `BunnyMintingStation` is the owner of `PancakeBunnies` and can grant minter roles to other contracts who can mint new collectibles.

`BunnyMintingStation` inherits from [`AccessControl`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/AccessControl.sol). Hence, it also inherits from [`Context`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Context.sol).

## 1. Variables

### Public variables

#### Bytes32 variables (uint256)

- `DEFAULT_ADMIN_ROLE`: bytes32 of admin role
- `MINTER_ROLE`: bytes32 of role for minting new NFTs

## 2. Functions

Note: all functions that are not inherited are external.

### Minter functions

- `mintCollectible(address _tokenReceiver, string _tokenURI, uint8 _bunnyId)`: mint a new NFT with tokenURI to a receiver address.

### Admin functions

- `setBunnyName(uint8 _bunnyId, string calldata _bunnyName)`: set the bunnyName in the `PancakeBunnies` contract
- `changeOwnershipNFTContract(_newOwner)`: change the owner of `PancakeBunnies`
