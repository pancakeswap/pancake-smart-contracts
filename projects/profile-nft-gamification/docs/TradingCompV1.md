# TradingCompV1

This document explains how the `TradingCompV1` contract works.

`TradingCompV1` inherits from [`Ownable`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol). It also inherits from [`Context`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Context.sol).

## 1. Variables

### 1.1. Public variables

#### uint256 & enum

- `currentStatus`: the status of the competition (0-4)
- `numberTeams`: the number of teams that exist at the time of the competition (i.e. 3)

#### Mappings

- `mapping(address => UserStats) userTradingStats`: it maps an address to the `UserStats` structure

### 1.2. Private variables

#### Mappings

- `mapping(address => CompetitionRewards) _rewardCompetitions`: it maps an address to the `CompetitionRewards` structure

### 1.3. Structures

##### CompetitionRewards

```
struct CompetitionRewards {
    uint256[5] userCampaignId;
    uint256[5] cakeRewards;
    uint256[5] pointUsers;
}
```

##### UserStats

```
struct UserStats {
    uint256 rewardGroup; // 0 to 4 --> 4 top / 0: bottom
    uint256 teamId; // 1 - 3
    bool hasRegistered; // true or false
    bool hasClaimed; // true or false
}
```

## 2. Functions

Note: all functions that are not inherited are external.

### 2.1 User functions

#### claimReward

```
function claimReward() external
```

#### register

```
function register() external
```

### 2.2 Owner functions

#### claimRemainder

```
function claimRemainder(uint256 _amount) external
```

#### updateTeamRewards

```
function updateTeamRewards(
    uint256 _teamId,
    uint256[5] calldata _userCampaignIds,
    uint256[5] calldata _cakeRewards,
    uint256[5] calldata _pointRewards
  ) external
```

#### updateUserStatusMultiple

```
function updateUserStatusMultiple(
    address[] calldata _addressesToUpdate,
    uint256 _rewardGroup
  ) external
```

#### updateWinningTeamAndTokenURI

```
function updateWinningTeamAndTokenURI(uint256 _winningTeamId, string calldata _tokenURI)
    external
```

### 2.3 View functions

#### canClaim

```
function canClaim(address _userAddress)
    external
    view
    returns (
      bool,
      uint256,
      uint256
    )
```

#### viewRewardTeams

```
function viewRewardTeams()
    external
    view
    returns (CompetitionRewards[] memory)
```

## 3. Events

- `NewCompetitionStatus(CompetitionStatus status)`
- `TeamRewardsUpdate(uint256 teamId)`
- `UserRegister(address userAddress, uint256 teamId)`
- `UserUpdateMultiple(address[] userAddresses, uint256 rewardGroup)`
- `WinningTeam(uint256 teamId)`
