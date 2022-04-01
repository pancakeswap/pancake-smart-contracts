# BunnySpecialPrediction

This document explains how the `BunnySpecialPrediction` contract works.

`BunnySpecialPrediction` inherits from [`Ownable`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Owanable.sol). Hence, it also inherits from [`Context`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Context.sol).

## 1. Variables

### Public variables

#### Numeric variables (uint256)

- `endBlock`: maximum block number to claim
- `thresholdRound`: maximum round if to claim (Prediction-related)

#### Mappings

- `bunnyTokenURI`: maps a`bunnyId` to its characteristics (tokenURI)
- `hasClaimed`: checks whether a user has claimed for a specific `bunnyId`.

### Private variables

#### Numeric variables (uint8)

- `previousNumberBunnyIds`: number of series before (i.e., 10)

## 2. Functions

Note: all functions that are not inherited are external.

### Users

- `mintNFT(_tokenId)`: mint a new NFT (with `_tokenId` from `previousNumberBunnyIds++`). It is only possible if the user has NOT claimed in this contract.

### Owner

- `addBunny(uint8 _bunnyId, string calldata _tokenURI)`: add a new bunny with its associated characteristics
- `changeEndBlock(uint256 _endBlock)`: update maximum block number to claim bunny
- `changeThresholdRound(uint256 _thresholdRound)`: update maximum claimable roundID based on first bet for the address

### View

- `canClaim(address _userAddress) returns (bool)`: check whether an address can claim (in order to mint) the bunny

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
    uint8 indexed bunnyId
);
```

It notifies that a new bunny was added for minting.

```
event NewEndBlock(
    uint256 endBlock
);

event NewThresholdRound(
    uint256 thresholdRound
);
```

It notifies that one of the bunnies' requirements to mint has changed.
