# Solidity API

## Delegator

### token

```solidity
contract IERC20 token
```

### VECake

```solidity
contract IVECake VECake
```

### constructor

```solidity
constructor(contract IVECake _VECake, contract IERC20 _token) public
```

Constructor

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _VECake | contract IVECake |  |
| _token | contract IERC20 |  |

### createLock

```solidity
function createLock(uint256 _amount, uint256 _unlockTime) external
```

### withdrawAll

```solidity
function withdrawAll(address _to) external
```

### earlyWithdraw

```solidity
function earlyWithdraw(address _to, uint256 _amount) external
```

### increaseLockAmount

```solidity
function increaseLockAmount(uint256 _amount) external
```

### increaseUnlockTime

```solidity
function increaseUnlockTime(uint256 _newUnlockTime) external
```

### emergencyWithdraw

```solidity
function emergencyWithdraw() external
```

### delegate

```solidity
function delegate(address user, uint256 amount, uint256 lockEndTime) external
```

Delegate in delegator smart contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | The user address |
| amount | uint256 | The delegated cake amount |
| lockEndTime | uint256 | The lock end time in cake pool. |

