# Solidity API

## VECake

### Deposit

```solidity
event Deposit(address locker, uint256 value, uint256 lockTime, uint256 lockType, uint256 timestamp)
```

### WithdrawAll

```solidity
event WithdrawAll(address locker, address to, uint256 value, uint256 timestamp)
```

### EarlyWithdraw

```solidity
event EarlyWithdraw(address locker, address to, uint256 value, uint256 penalty, uint256 timestamp)
```

### SetBreaker

```solidity
event SetBreaker(uint256 previousBreaker, uint256 breaker)
```

### Supply

```solidity
event Supply(uint256 previousSupply, uint256 supply)
```

### SetEarlyWithdrawConfig

```solidity
event SetEarlyWithdrawConfig(address caller, uint64 oldEarlyWithdrawFeeBps, uint64 newEarlyWithdrawFeeBps, uint64 oldRedistributeBps, uint64 newRedistribiteBps, address oldTreasuryAddr, address newTreasuryAddr, address oldRedistributeAddr, address newRedistributeAddr)
```

### Redistribute

```solidity
event Redistribute(address caller, address destination, uint256 amount)
```

### SetWhitelistedCaller

```solidity
event SetWhitelistedCaller(address caller, address addr, bool ok)
```

### SetWhitelistedRedistributors

```solidity
event SetWhitelistedRedistributors(address caller, address addr, bool ok)
```

### MigrateFromCakePool

```solidity
event MigrateFromCakePool(address user, address proxy, uint256 amount, uint256 endTime)
```

### DelegateFromCakePool

```solidity
event DelegateFromCakePool(address user, address delegator, uint256 amount, uint256 endTime)
```

### MigrationConvertToDelegation

```solidity
event MigrationConvertToDelegation(address user, address delegator, uint256 amount, uint256 endTime)
```

### UpdateDelegator

```solidity
event UpdateDelegator(address delegator, bool isDelegator, uint40 limitTimestampForEarlyWithdraw)
```

### InjectToDelegator

```solidity
event InjectToDelegator(address user, address delegator, uint256 amount)
```

### SetLimitTimeOfConvert

```solidity
event SetLimitTimeOfConvert(address user, uint256 newValue)
```

### SetEarlyWithdrawSwitch

```solidity
event SetEarlyWithdrawSwitch(address user, bool newValue)
```

### SetNoPenaltyForEarlyWithdraw

```solidity
event SetNoPenaltyForEarlyWithdraw(address owner, address user, bool newValue)
```

### SetEmergencyWithdrawSwitch

```solidity
event SetEmergencyWithdrawSwitch(address user, bool newValue)
```

### EmergencyWithdraw

```solidity
event EmergencyWithdraw(address user, uint256 amount)
```

### NewFarmBooster

```solidity
event NewFarmBooster(address farmBooster)
```

### Point

```solidity
struct Point {
  int128 bias;
  int128 slope;
  uint256 timestamp;
  uint256 blockNumber;
}
```

### LockedBalance

```solidity
struct LockedBalance {
  int128 amount;
  uint256 end;
}
```

### UserInfo

```solidity
struct UserInfo {
  address cakePoolProxy;
  uint128 cakeAmount;
  uint48 lockEndTime;
  uint48 migrationTime;
  uint16 cakePoolType;
  uint16 withdrawFlag;
}
```

### Delegator

```solidity
struct Delegator {
  uint104 delegatedCakeAmount;
  uint104 notInjectedCakeAmount;
  uint40 limitTimestampForEarlyWithdraw;
  uint8 isDelegator;
}
```

### MIGRATION_FROM_CAKE_POOL_FLAG

```solidity
uint16 MIGRATION_FROM_CAKE_POOL_FLAG
```

### DELEGATION_FROM_CAKE_POOL_FLAG

```solidity
uint16 DELEGATION_FROM_CAKE_POOL_FLAG
```

### NOT_WITHDRAW_FLAG

```solidity
uint16 NOT_WITHDRAW_FLAG
```

### WITHDREW_FLAG

```solidity
uint16 WITHDREW_FLAG
```

### NOT_DELEGATOR_FLAG

```solidity
uint8 NOT_DELEGATOR_FLAG
```

### DELEGATOR_FLAG

```solidity
uint8 DELEGATOR_FLAG
```

### ACTION_DEPOSIT_FOR

```solidity
uint256 ACTION_DEPOSIT_FOR
```

### ACTION_CREATE_LOCK

```solidity
uint256 ACTION_CREATE_LOCK
```

### ACTION_INCREASE_LOCK_AMOUNT

```solidity
uint256 ACTION_INCREASE_LOCK_AMOUNT
```

### ACTION_INCREASE_UNLOCK_TIME

```solidity
uint256 ACTION_INCREASE_UNLOCK_TIME
```

### WEEK

```solidity
uint256 WEEK
```

### MAX_LOCK

```solidity
uint256 MAX_LOCK
```

### MULTIPLIER

```solidity
uint256 MULTIPLIER
```

### token

```solidity
contract IERC20 token
```

### supply

```solidity
uint256 supply
```

### CakePool

```solidity
contract ICakePool CakePool
```

### ProxyForCakePoolFactory

```solidity
contract IProxyForCakePoolFactory ProxyForCakePoolFactory
```

### FarmBooster

```solidity
contract IFarmBooster FarmBooster
```

### initialization

```solidity
bool initialization
```

### limitTimeOfConvert

```solidity
uint256 limitTimeOfConvert
```

### emergencyWithdrawSwitch

```solidity
bool emergencyWithdrawSwitch
```

### everEmergencyWithdraw

```solidity
mapping(address => bool) everEmergencyWithdraw
```

### locks

```solidity
mapping(address => struct VECake.LockedBalance) locks
```

### userInfo

```solidity
mapping(address => struct VECake.UserInfo) userInfo
```

### delegator

```solidity
mapping(address => struct VECake.Delegator) delegator
```

### isCakePoolProxy

```solidity
mapping(address => bool) isCakePoolProxy
```

### noPenaltyForEarlyWithdraw

```solidity
mapping(address => bool) noPenaltyForEarlyWithdraw
```

### epoch

```solidity
uint256 epoch
```

### pointHistory

```solidity
struct VECake.Point[] pointHistory
```

### userPointHistory

```solidity
mapping(address => struct VECake.Point[]) userPointHistory
```

### userPointEpoch

```solidity
mapping(address => uint256) userPointEpoch
```

### slopeChanges

```solidity
mapping(uint256 => int128) slopeChanges
```

### breaker

```solidity
uint256 breaker
```

### name

```solidity
string name
```

### symbol

```solidity
string symbol
```

### decimals

```solidity
uint8 decimals
```

### earlyWithdrawBpsPerWeek

```solidity
uint64 earlyWithdrawBpsPerWeek
```

### redistributeBps

```solidity
uint64 redistributeBps
```

### accumRedistribute

```solidity
uint256 accumRedistribute
```

### treasuryAddr

```solidity
address treasuryAddr
```

### redistributeAddr

```solidity
address redistributeAddr
```

### earlyWithdrawSwitch

```solidity
bool earlyWithdrawSwitch
```

### whitelistedCallers

```solidity
mapping(address => bool) whitelistedCallers
```

### whitelistedRedistributors

```solidity
mapping(address => bool) whitelistedRedistributors
```

### onlyRedistributors

```solidity
modifier onlyRedistributors()
```

### onlyEOAorWhitelisted

```solidity
modifier onlyEOAorWhitelisted()
```

### onlyCakePool

```solidity
modifier onlyCakePool()
```

### constructor

```solidity
constructor(contract ICakePool _cakePool, contract IERC20 _token, contract IProxyForCakePoolFactory _ProxyForCakePoolFactory) public
```

Constructor

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _cakePool | contract ICakePool |  |
| _token | contract IERC20 |  |
| _ProxyForCakePoolFactory | contract IProxyForCakePoolFactory | The cake pool proxy factory |

### initializeCakePoolMigration

```solidity
function initializeCakePoolMigration() external
```

Initialize for cake pool migration

_Need to check whether cake pool conditions are met_

### getUserInfo

```solidity
function getUserInfo(address _user) external view returns (int128 amount, uint256 end, address cakePoolProxy, uint128 cakeAmount, uint48 lockEndTime, uint48 migrationTime, uint16 cakePoolType, uint16 withdrawFlag)
```

Return user information include LockedBalance and UserInfo

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | The user address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | int128 | The user lock amount |
| end | uint256 | The user lock end time |
| cakePoolProxy | address | Proxy Smart Contract for users who had locked in cake pool |
| cakeAmount | uint128 | Cake amount locked in cake pool |
| lockEndTime | uint48 | Record the lockEndTime in cake pool |
| migrationTime | uint48 | Record the migration time |
| cakePoolType | uint16 | 1: Migration, 2: Delegation |
| withdrawFlag | uint16 | 0: Not withdraw, 1 : withdrew |

### balanceOfAtForProxy

```solidity
function balanceOfAtForProxy(address _user, uint256 _blockNumber) external view returns (uint256)
```

Return the proxy balance of VECake at a given "_blockNumber"

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | The proxy owner address to get a balance of VECake |
| _blockNumber | uint256 | The speicific block number that you want to check the balance of VECake |

### balanceOfAt

```solidity
function balanceOfAt(address _user, uint256 _blockNumber) external view returns (uint256)
```

Return the balance of VECake at a given "_blockNumber"

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | The address to get a balance of VECake |
| _blockNumber | uint256 | The speicific block number that you want to check the balance of VECake |

### balanceOfAtUser

```solidity
function balanceOfAtUser(address _user, uint256 _blockNumber) external view returns (uint256)
```

### _balanceOfAt

```solidity
function _balanceOfAt(address _user, uint256 _blockNumber) internal view returns (uint256)
```

### balanceOfForProxy

```solidity
function balanceOfForProxy(address _user) external view returns (uint256)
```

Return the voting weight of a givne user's proxy

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | The address of a user |

### balanceOf

```solidity
function balanceOf(address _user) external view returns (uint256)
```

Return the voting weight of a givne user

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | The address of a user |

### balanceOfUser

```solidity
function balanceOfUser(address _user) external view returns (uint256)
```

### balanceOfAtTime

```solidity
function balanceOfAtTime(address _user, uint256 _timestamp) external view returns (uint256)
```

### _balanceOf

```solidity
function _balanceOf(address _user, uint256 _timestamp) internal view returns (uint256)
```

### _checkpoint

```solidity
function _checkpoint(address _address, struct VECake.LockedBalance _prevLocked, struct VECake.LockedBalance _newLocked) internal
```

Record global and per-user slope to checkpoint

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _address | address | User's wallet address. Only global if 0x0 |
| _prevLocked | struct VECake.LockedBalance | User's previous locked balance and end lock time |
| _newLocked | struct VECake.LockedBalance | User's new locked balance and end lock time |

### checkpoint

```solidity
function checkpoint() external
```

Trigger global checkpoint

### deposit

```solidity
function deposit(address _user, uint256 _amount, uint256 _lockDuration) external
```

Deposit in cake pool

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | user address |
| _amount | uint256 |  |
| _lockDuration | uint256 |  |

### withdraw

```solidity
function withdraw(address _user) external
```

Withdraw in cake pool

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | user address |

### migrateFromCakePool

```solidity
function migrateFromCakePool() external
```

Migrate from cake pool.

### delegateFromCakePool

```solidity
function delegateFromCakePool(address _delegator) external
```

Delegate from cake pool.

_this function will call one function in delegator smart contract, DelegatorSC.delegate(address user, uint256 amount, uint256 endTime)._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _delegator | address | delegation address |

### migrationConvertToDelegation

```solidity
function migrationConvertToDelegation(address _delegator) external
```

Migration convert to delegation.

_Migration users can delegate within a certain period after migrated._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _delegator | address | delegation address |

### createLock

```solidity
function createLock(uint256 _amount, uint256 _unlockTime) external
```

Create a new lock.

_This will crate a new lock and deposit Cake to VECake Vault_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amount | uint256 | the amount that user wishes to deposit |
| _unlockTime | uint256 | the timestamp when Cake get unlocked, it will be floored down to whole weeks |

### createLockForProxy

```solidity
function createLockForProxy(uint256 _amount, uint256 _unlockTime) external
```

### _createLock

```solidity
function _createLock(uint256 _amount, uint256 _unlockTime) internal
```

### depositFor

```solidity
function depositFor(address _for, uint256 _amount) external
```

Deposit `_amount` tokens for `_for` and add to `locks[_for]`

_This function is used for deposit to created lock. Not for extend locktime._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _for | address | The address to do the deposit |
| _amount | uint256 | The amount that user wishes to deposit |

### _depositFor

```solidity
function _depositFor(address _for, uint256 _amount, uint256 _unlockTime, struct VECake.LockedBalance _prevLocked, uint256 _actionType, bool _isCakePoolUser) internal
```

Internal function to perform deposit and lock Cake for a user

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _for | address | The address to be locked and received VECake |
| _amount | uint256 | The amount to deposit |
| _unlockTime | uint256 | New time to unlock Cake. Pass 0 if no change. |
| _prevLocked | struct VECake.LockedBalance | Existed locks[_for] |
| _actionType | uint256 | The action that user did as this internal function shared among |
| _isCakePoolUser | bool | This user is cake pool user or not several external functions |

### _findBlockEpoch

```solidity
function _findBlockEpoch(uint256 _blockNumber, uint256 _maxEpoch) internal view returns (uint256)
```

Do Binary Search to find out block timestamp for block number

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _blockNumber | uint256 | The block number to find timestamp |
| _maxEpoch | uint256 | No beyond this timestamp |

### _findUserBlockEpoch

```solidity
function _findUserBlockEpoch(address _user, uint256 _blockNumber) internal view returns (uint256)
```

Do Binary Search to find the most recent user point history preceeding block

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | The address of user to find |
| _blockNumber | uint256 | Find the most recent point history before this block number |

### increaseLockAmount

```solidity
function increaseLockAmount(uint256 _amount) external
```

Increase lock amount without increase "end"

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amount | uint256 | The amount of Cake to be added to the lock |

### increaseUnlockTime

```solidity
function increaseUnlockTime(uint256 _newUnlockTime) external
```

Increase unlock time without changing locked amount

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newUnlockTime | uint256 | The new unlock time to be updated |

### _timestampToFloorWeek

```solidity
function _timestampToFloorWeek(uint256 _timestamp) internal pure returns (uint256)
```

Round off random timestamp to week

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _timestamp | uint256 | The timestamp to be rounded off |

### totalSupply

```solidity
function totalSupply() external view returns (uint256)
```

Calculate total supply of VECake (voting power)

### totalSupplyAtTime

```solidity
function totalSupplyAtTime(uint256 _timestamp) external view returns (uint256)
```

Calculate total supply of VECake (voting power) at at specific timestamp

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _timestamp | uint256 | The specific timestamp to calculate totalSupply |

### totalSupplyAt

```solidity
function totalSupplyAt(uint256 _blockNumber) external view returns (uint256)
```

Calculate total supply of VECake at specific block

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _blockNumber | uint256 | The specific block number to calculate totalSupply |

### _totalSupplyAt

```solidity
function _totalSupplyAt(struct VECake.Point _point, uint256 _timestamp) internal view returns (uint256)
```

Calculate total supply of VECake (voting power) at some point in the past

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _point | struct VECake.Point | The point to start to search from |
| _timestamp | uint256 | The timestamp to calculate the total voting power at |

### setBreaker

```solidity
function setBreaker(uint256 _breaker) external
```

Set breaker

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _breaker | uint256 | The new value of breaker 0 if off, 1 if on |

### withdrawAll

```solidity
function withdrawAll(address _to) external
```

Withdraw all Cake when lock has expired.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address | The address which will receive the cake |

### earlyWithdraw

```solidity
function earlyWithdraw(address _to, uint256 _amount) external
```

Early withdraw Cake with penalty.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address | The address which will receive the cake |
| _amount | uint256 | Cake amount |

### emergencyWithdraw

```solidity
function emergencyWithdraw() external
```

Emergency withdraw Cake.

_Under any circumstances, it is guaranteed that the user’s assets will not be locked_

### redistribute

```solidity
function redistribute() external
```

### _unlock

```solidity
function _unlock(address _user, struct VECake.LockedBalance _lock, uint256 _withdrawAmount) internal
```

### setEarlyWithdrawConfig

```solidity
function setEarlyWithdrawConfig(uint64 _newEarlyWithdrawBpsPerWeek, uint64 _newRedistributeBps, address _newTreasuryAddr, address _newRedistributeAddr) external
```

### setWhitelistedCallers

```solidity
function setWhitelistedCallers(address[] callers, bool ok) external
```

### setWhitelistedRedistributors

```solidity
function setWhitelistedRedistributors(address[] callers, bool ok) external
```

### updateDelegator

```solidity
function updateDelegator(address _delegator, bool _isDelegator, uint40 _limitTimestampForEarlyWithdraw) external
```

Update delegator

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _delegator | address | The delegator address |
| _isDelegator | bool | Is delegator or not |
| _limitTimestampForEarlyWithdraw | uint40 | Delegator can not call earlyWithdraw before limit time. |

### setLimitTimeOfConvert

```solidity
function setLimitTimeOfConvert(uint256 _limitTime) external
```

Set limitTimeOfConvert

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _limitTime | uint256 | The limit time |

### setEarlyWithdrawSwitch

```solidity
function setEarlyWithdrawSwitch(bool _earlyWithdrawSwitch) external
```

Set ealy withdraw switch

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _earlyWithdrawSwitch | bool | early withdraw switch |

### setEmergencyWithdrawSwitch

```solidity
function setEmergencyWithdrawSwitch(bool _emergencyWithdrawSwitch) external
```

Set emergency withdraw switch

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _emergencyWithdrawSwitch | bool | early withdraw switch |

### setNoPenaltyForEarlyWithdraw

```solidity
function setNoPenaltyForEarlyWithdraw(address _user, bool _status) external
```

Set no penalty early withdraw user

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | no penalty early withdraw user |
| _status | bool | no penalty or not |

### injectToDelegator

```solidity
function injectToDelegator(address _delegator, uint256 _amount) external
```

Inject cake for delegator

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _delegator | address | The delegator address |
| _amount | uint256 | Cake amount |

### setFarmBooster

```solidity
function setFarmBooster(address _farmBooster) external
```

Set farm booster Contract address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _farmBooster | address | The farm booster Contract address |

