# PancakeProfile

This document explains how the `PancakeProfile` contract works.

PancakeProfile inherits from [`AccessControl`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/AccessControl.sol) and [`ERC721Holder`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC721/ERC721Holder.sol) from OpenZeppelin. It also inherits from [`IERC721Receiver`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC721/IERC721Receiver.sol) and [`Context`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Context.sol).

## 1. Variables

### Public variables

#### Numeric variables (uint256)

- `numberActiveProfiles`: number of profiles active (excl. users that are paused)
- `numberCakeToReactivate`: number of CAKE tokens to reactivate a profile. CAKE token has 18 decimals.
- `numberCakeToRegister`: number of CAKE tokens to register a profile. CAKE token has 18 decimals.
- `numberCakeToUpdate`: number of CAKE tokens required to update a profile (i.e. change profile picture by switching NFT tokens). CAKE token has 18 decimals.
- `numberTeams`: number of teams (incl. teams that are not joinable)

#### Mappings

- `mapping (address => bool) hasRegistered`: maps whether an address is registered

#### Bytes32 (roles)

- `DEFAULT_ADMIN_ROLE`: it is the deployer of the contract and any individual
- `NFT_ROLE`: used for NFT contracts that can be deposited to the PancakeProfile contract
- `POINT_ROLE`: used for addresses (EOA + contracts) that can increase the number of points
- `SPECIAL_ROLE`: used for addresses (EOA + contracts) that can change a user's team

### Private variables

#### Others

- `_countTeams`: it is used to generate a unique incremental `teamId` for teams
- `_countUsers`: it is used to generate a unique incremental `userId` for users

#### Mappings

- `teams (uint256 => Team)`: maps the `teamId` to the structure `Team`
- `users (address => User)`: maps the `userAddress` to the structure `User`

They should be accessed with view functions described below.

### Structures

#### Team

```
struct Team {
    string teamName;
    string teamDescription;
    uint256 numberUsers;
    uint256 numberPoints;
    bool isJoinable;
}
```

#### User

```
struct User {
    uint256 userId;
    uint256 numberPoints;
    uint256 teamId;
    address nftAddress;
    uint256 tokenId;
    bool isActive;
}
```

## 2. Functions

Note: all functions that are not inherited are external.

### Users

#### createProfile

```
function createProfile(
        uint256 _teamId,
        address _nftAddress,
        uint256 _tokenId
    ) external {
```

User selects a NFT token to deposit (amongst the list of eligible NFT contracts) to the profile contract, pay some CAKE (`numberCakeToRegister`), select a `teamId` to join. Only available if not registered. Teams must be joinable (`isJoinable == true`), and exist, at the time of creation.

#### pauseProfile

```
function pauseProfile() external {
```

This function withdraws the NFT token from the contract. It costs 0 CAKE token. It reduces the number of users in a team and updates the status (`isActive`) of the user to `false`.

**NOTE: users are expected to become ineligible to collect new points.** Checks are expected to be implemented at the level of admin contracts.

Only available if active (`isActive == true`).

#### reactivateProfile

```
function reactivateProfile(
        address _nftAddress,
        uint256 _tokenId
    ) external {
```

User deposits a NFT token to the contract. It requires some CAKE (`numberCakeToReactivate`). Only available if paused (`isActive == false`).

#### updateProfile

```
function updateProfile(
        address _nftAddress,
        uint256 _tokenId
    ) external {
```

This function is used to change the NFT token amongst the list of eligible NFT contracts. It sends back to the user the token deposited and sends the new token to the contract. It costs some CAKE (`numberCakeToUpdate`). Only available if active (`isActive == true`).

### View functions (external)

#### User scope

#### getUserProfile

```
function getUserProfileByAddress(address _userAddress)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            address,
            uint256,
            bool
        )
    {
```

It returns:

- `userId`
- number of points (`numberPoints`)
- `teamId`
- NFT contract address (`nftAddress`)
- `tokenId` associated with the contract address
- whether the user is active (`isActive`)

#### getUserStatus

```
function getUserStatus(address _userAddress) external view returns (bool)
```

It returns whether the address has an active profile.

#### Team scope

```
function getTeamProfile(uint256 _teamId)
        external
        view
        returns (
            string memory,
            string memory,
            uint256,
            uint256,
            bool
        )
    {

```

It returns:

- name of the team (`teamName`)
- description of the team (`teamDescription`)
- the number of users in the team (`numberUsers`)
- the team's number of points (`numberPoints`)
- whether the team is joinable (`isJoinable`)

### Point functions

These functions have a modifier `onlyPoint` that restricts the scope of who can call them.

#### increaseUserPoints

```
function increaseUserPoints(address _userAddress, uint256 _numberPoints, uint256 _campaignId)
        external
        onlyPoint
    {
```

It increases the number of points for a user (`_userAddress`).

#### increaseUserPointsMultiple

```
    function increaseUserPointsMultiple(
        address[] calldata _userAddresses,
        uint256 _numberPoints,
        uint256 _campaignId
    ) external onlyPoint
    {
```

It increases number of points for a list of users (`_userAddresses`).

#### increaseTeamPoints

```
function increaseTeamPoints(uint256 _teamId, uint256 _numberPoints, uint256 _campaignId)
        external
        onlyPoint
    {
```

It increases the number of points for a team (`_teamId`).

### Owner functions

These functions have a modifier `onlyOwner` that restricts the scope of who can call them.

#### Add team

```
function addTeam(uint256 _teamId, string calldata _teamName, string calldata _teamDescription)
        external
        onlyOwner
    {
```

Note: it is not possible to remove a team after but it is possible to rename it or make it non-joinable for new users.

#### Add/remove NFT addresses

```
function addNftAddress(address _nftAddress) external onlyOwner {
```

To add a NFT contract, it is recommended to use this function (vs. `grantRole`) to make sure the ERC721 interface is implemented as expected.

To remove NFT contracts, use `revokeRole` as defined in the `AccessControl` library.

#### Claim fee

```
function claimFee(uint256 _amount) external onlyOwner {
```

This function is used to remove NFT contracts eligible as profile pictures. It doesn't cause problems for users to pause their profiles.

#### Make teams joinable and not joinable

##### makeTeamJoinable

```
function makeTeamJoinable(uint256 _teamId) external onlyOwner {
```

##### makeTeamNotJoinable

```
function makeTeamNotJoinable(uint256 _teamId) external onlyOwner {
```

#### Rename team

```
function renameTeam(uint256 _teamId, string calldata _teamName, string calldata _teamDescription) external onlyOwner {
```

#### Update numbers of CAKE tokens required for user operations

```
function updateNumberCake(
        uint256 _newNumberCakeToReactivate,
        uint256 _newNumberCakeToRegister,
        uint256 _newNumberCakeToUpdate
    ) external onlyOwner
```

This function allows the owner(s) to change threshold number of CAKEs for the 3 parameters:

- `numberCakeToReactivate`
- `numberCakeToRegister`
- `numberCakeToUpdate`

### Special functions

It consists of a single function that can be called by special roles.

This function has a modifier `onlySpecial` that restricts the scope of who can call them.

#### Change team of user

```
function changeTeam(address _userAddress, uint256 _newTeamId)
        external
        onlySpecial
    {
```

This function is not meant to be implemented but was added to the contract if this requirement were to change.

## 3. Events

### User actions

- `UserNew(address indexed userAddress, uint256 teamId, address nftAddress, uint256 tokenId)`: it notifies that a user has just registered
- `UserPause(address indexed userAddress, uint256 teamId)`: it notifies a user pausing her profile
- `UserReactivate(address indexed userAddress, uint256 teamId, address nftAddress, uint256 tokenId)`: it notifies that a user is reactivating her profile
- `UserUpdate(address indexed userAddress, address nftAddress, uint256 tokenId)`: it notifies that a user is pausing her profile

### Point changes

- `TeamPointIncrease(uint256 teamId, uint256 numberPoints, uint256 campaignId)`: it notifies that team points are increased
- `UserPointIncrease(address indexed userAddress, uint256 numberPoints, uint256 campaignId)`: it notifies that user points are increased
- `UserPointIncreaseMultiple(address[] userAddresses, uint256 numberPoints, uint256 campaignId)`: it notifies that a list of users has seen an increase in user points

### Others

- `TeamAdd(uint256 teamId, string teamName)`: it notifies a new team is created
- `UserChangeTeam(address indexed userAddress, uint256 oldTeamId, uint256 newTeamId)`: it notifies that a user has changed team. While it is implemented, it is triggered by a function that not meant to be used (for now).
