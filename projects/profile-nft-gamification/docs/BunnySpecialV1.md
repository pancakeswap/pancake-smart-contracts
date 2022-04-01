# BunnySpecialV1

This document explains how the `BunnySpecialV1` contract works.

`BunnySpecialV1` inherits from [`Ownable`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Owanable.sol). Hence, it also inherits from [`Context`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Context.sol).

## 1. Variables

### Public variables

#### Numeric variables (uint256)

- `maxViewLength`: maximum length parameter for view function
- `numberDifferentBunnies`: keeps track of number of bunnies available

#### Mappings

- `bunnyCharacteristics`: maps a`bunnyId` to its characteristics
- `hasClaimed`: checks whether a user has claimed for a specific `bunnyId`.

### Private variables

#### Numeric variables (uint8)

- `previousNumberBunnyIds`: number of series before (i.e., 10)

## 2. Functions

Note: all functions that are not inherited are external.

### Users

- `mintNFT(_tokenId)`: mint a new NFT (with `_tokenId` from 10+). It is only possible if the user has NOT claimed in V2 or V3 (i.e. this contract).

### Owner

- `addBunny(uint8 _bunnyId, string calldata _tokenURI, uint256 _thresholdUser, uint256 _cakeCost )`: add a new bunny with its associated characteristics
- `claimFee(uint256 _amount)`: retrieve the CAKE token from the contract
- `updateBunny( uint8 _bunnyId, uint256 _thresholdUser, uint256 _cakeCost, bool _isActive )`: update the bunny's characteristics (only the tokenURI is immutable)
- `updateMaxViewLength(uint256 _newMaxViewLength)`: update the `maxViewLength` for view functions

### View

- `canClaimSingle(address _userAddress, uint8 _bunnyId) returns (bool)`: it checks whether an address can mint a specific bunny (based on `_bunnyId`)
- `canClaimMultiple(address _userAddress, uint8[] calldata _bunnyIds) external view returns (bool[] memory)`: it checks whether an address can mint a specific bunny (based on `_bunnyIds[]`). If address has no active profile, it returns an empty array. If the user has never registered, it reverts.

## 3. Events

### User-related

```
event BunnyMint(
    address indexed to,
    uint256 indexed tokenId,
    uint8 indexed bunnyId
);
```

It indicates when a new bunny is minted.

### Admin-related

```
event BunnyAdd(
    uint8 indexed bunnyId,
    uint256 thresholdUser,
    uint256 costCake
);
```

It notifies that a new bunny was added for minting.

```
event BunnyChange(
    uint8 indexed bunnyId,
    uint256 thresholdUser,
    uint256 costCake,
    bool isActive
);
```

It notifies that one of the bunnies' requirements to mint has changed.
