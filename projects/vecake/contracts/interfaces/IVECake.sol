// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

struct Point {
    int128 bias; // Voting weight
    int128 slope; // Multiplier factor to get voting weight at a given time
    uint256 timestamp;
    uint256 blockNumber;
}

interface IVECake {
    /// @dev Cake pool deposit will trigger this
    function deposit(
        address _user,
        uint256 _amount,
        uint256 _lockDuration
    ) external;

    /// @dev Cake pool withdraw will trigger this
    function withdraw(address _user) external;

    /// @dev Return the max epoch of the given "_user"
    function userPointEpoch(address _user) external view returns (uint256);

    /// @dev Return the max global epoch
    function epoch() external view returns (uint256);

    /// @dev Return the recorded point for _user at specific _epoch
    function userPointHistory(address _user, uint256 _epoch) external view returns (Point memory);

    /// @dev Return the recorded global point at specific _epoch
    function pointHistory(uint256 _epoch) external view returns (Point memory);

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

    /// @notice Migrate from cake pool.
    function migrateFromCakePool() external;

    /// @notice Delegate from cake pool.
    /// @dev this function will call one function in delegator smart contract, like this: DelegatorSC.delegate(address user, uint256 amount, uint256 endTime).
    /// @param _delegator delegator address
    function delegateFromCakePool(address _delegator) external;

    /// @notice Create a new lock.
    /// @dev This will crate a new lock and deposit Cake to VECake Vault
    /// @param _amount the amount that user wishes to deposit
    /// @param _unlockTime the timestamp when Cake get unlocked, it will be
    /// floored down to whole weeks
    function createLock(uint256 _amount, uint256 _unlockTime) external;

    function createLockForProxy(uint256 _amount, uint256 _unlockTime) external;

    /// @notice Increase lock amount without increase "end"
    /// @param _amount The amount of Cake to be added to the lock
    function increaseLockAmount(uint256 _amount) external;

    /// @notice Increase unlock time without changing locked amount
    /// @param _newUnlockTime The new unlock time to be updated
    function increaseUnlockTime(uint256 _newUnlockTime) external;

    /// @notice Withdraw all Cake when lock has expired
    /// @param _to The address which will receive the cake
    function withdrawAll(address _to) external;

    /// @notice Early withdraw Cake with penalty.
    /// @param _to The address which will receive the cake
    /// @param _amount Cake amount
    function earlyWithdraw(address _to, uint256 _amount) external;

    /// @notice Emergency withdraw Cake.
    /// @dev Under any circumstances, it is guaranteed that the user’s assets will not be locked
    function emergencyWithdraw() external;
}
