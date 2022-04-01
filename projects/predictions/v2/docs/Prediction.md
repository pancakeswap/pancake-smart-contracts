# Contract description

This document explains how the `Prediction` contract works.

## 1. Variables

### Public variables

#### Numeric variables (uint256)

- `cunrrentEpoch`: current epoch index
- `internalBlocks`: number of blocks between each epoch

#### Mappings

- `rounds (uint256 => Round)`: maps the `epoch` to the structure `Round`
- `ledger (uint256 => mapping(address => BetInfo))`: maps the `epoch` and `address` to the structure `BetInfo`

#### address

- `adminAddress`
- `WBNB`
- `oracle`

### Structures

#### Round

```
struct Round {
    uint256 epoch;
    uint256 startBlock;
    uint256 lockBlock;
    uint256 closeBlock;
    uint256 lockPrice;
    uint256 closePrice;
    uint256 totalAmount;
    uint256 bullAmount;
    uint256 bearAmount;
    uint256 rewardBaseCalAmount;
    uint256 rewardAmount;
    bool oracleCalled;
}
```

#### BetInfo

```
struct User {
    bool direction;
    uint256 amount;
}
```

## 2. Functions

### Call by Owner

#### setAdmin

```
function setAdmin(address _adminAddress) external onlyOwner
```

#### startFirstRound

```
function startFirstRound() external onlyOwner 
```


### Call by Admin

#### setInternalBlocks

```
function setInternalBlocks(uint256 _internalBlocks) external onlyAdmin 
```

#### setOracle

```
function setOracle(IOracle _oracles) external onlyAdmin
```

#### nextRound

```
function nextRound() external onlyAdmin
```

### Call by Users

#### betDirection

```
function bidBull() external payable {}
function bidBear() external payable {}
```

##### Cases
1. First betting with direction and value 
2. Add more value to the same direction betting
3. Change the direction with or without value

#### claim

```
function claim(uint256 epoch) external 
```

### View functions (external)

#### claimable

```
function claimable(uint256 epoch, address user) public view returns(bool res) 
```

## 3. Events

- `NextRound(uint256 indexed epoch)`
- ` event BetBull(address indexed sender, uint256 indexed currentEpoch, uint256 price)`
- ` event BetBear(address indexed sender, uint256 indexed currentEpoch, uint256 price)`
- `Claim(address indexed sender, uint256 indexed currentEpoch, uint256 price)`

