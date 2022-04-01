# PointCenterIFO

This document explains how the `PointCenterIFO` contract works.

`PointCenterIFO` inherits from [`Ownable`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol). It also inherits from [`Context`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Context.sol).

## 1. Variables

### Public variables

#### maxViewLength

It is the maximum length for the number of IFO that can be checked in `checkClaimStatuses`. It can be updated with `updateMaxViewLength`.

### Private variables

#### Mappings

- `mapping(address => IFOs) public ifos`: it maps an address to the IFO characteristics for point distribution
- `mapping(address => mapping(address => bool)) private _users`: it maps user address to a mapping of IFO addresses to check if they have claimed the rewards

#### Structures

##### IFOs

```
struct IFOs {
    uint256 thresholdToClaim;
    uint256 campaignId;
    uint256 numberPoints;
}
```

## 2. Functions

Note: all functions that are not inherited are external.

### Users

#### getPoints

```
function getPoints(address _contractAddress) external
```

It allows the user to get points if he participated in an IFO.

### Admins

#### addIFOAddress

```
function addIFOAddress(
    address _contractAddress,
    uint256 _campaignId,
    uint256 _thresholdToClaim,
    uint256 _numberPoints
) external onlyOwner
```

It enables the admin to add an IFO contract for users to claim points.

#### updateMaxViewLength

```
function updateMaxViewLength(uint256 _newMaxViewLength) external onlyOwner
```

It allows the owner to update the number of IFOs that can be returned with the view function.

### View functions

#### checkClaimStatus

```
function checkClaimStatus(address _userAddress, address _contractAddress)
        external
        view
        returns (bool)
```

It checks whether a user address can collect points for a past IFO (`_contractAddress`).

#### checkClaimStatuses

```
function checkClaimStatuses(
        address _userAddress,
        address[] memory _contractAddresses
    ) external view returns (bool[] memory)
```

It checks whether a user address can collect points for a list of IFO addresses (`_contractAddresses`). The number of addresses that can be checked is bounded by `maxViewLength`.

## 3. Events

### IFOAdd

```
event IFOAdd(
    address indexed contractAddress,
    uint256 thresholdToClaim,
    uint256 indexed campaignId,
    uint256 numberPoints
);

```

It is triggered when new IFOs are added with `addIFOAddress`.
