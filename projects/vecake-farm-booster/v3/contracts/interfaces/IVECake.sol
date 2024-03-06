// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IVECake {
    function userInfo(address user)
        external
        view
        returns (
            address cakePoolProxy, // Proxy Smart Contract for users who had locked in cake pool.
            uint128 cakeAmount, //  Cake amount locked in cake pool.
            uint48 lockEndTime, // Record the lockEndTime in cake pool.
            uint48 migrationTime, // Record the migration time.
            uint16 cakePoolType, // 1: Migration, 2: Delegation.
            uint16 withdrawFlag // 0: Not withdraw, 1 : withdrew.
        );

    function isCakePoolProxy(address _user) external view returns (bool);

    /// @dev Return the max epoch of the given "_user"
    function userPointEpoch(address _user) external view returns (uint256);

    /// @dev Return the max global epoch
    function epoch() external view returns (uint256);

    /// @dev Trigger global check point
    function checkpoint() external;

    /// @notice Return the proxy balance of VECake at a given "_blockNumber"
    /// @param _user The proxy owner address to get a balance of VECake
    /// @param _blockNumber The speicific block number that you want to check the balance of VECake
    function balanceOfAtForProxy(address _user, uint256 _blockNumber) external view returns (uint256);

    /// @notice Return the balance of VECake at a given "_blockNumber"
    /// @param _user The address to get a balance of VECake
    /// @param _blockNumber The speicific block number that you want to check the balance of VECake
    function balanceOfAt(address _user, uint256 _blockNumber) external view returns (uint256);

    /// @notice Return the voting weight of a givne user's proxy
    /// @param _user The address of a user
    function balanceOfForProxy(address _user) external view returns (uint256);

    /// @notice Return the voting weight of a givne user
    /// @param _user The address of a user
    function balanceOf(address _user) external view returns (uint256);

    /// @notice Calculate total supply of VECake (voting power)
    function totalSupply() external view returns (uint256);
}
