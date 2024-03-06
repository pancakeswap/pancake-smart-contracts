// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IFarmBooster {
    // uint256 public constant ACTION_DEPOSIT_FOR = 0;
    // uint256 public constant ACTION_CREATE_LOCK = 1;
    // uint256 public constant ACTION_INCREASE_LOCK_AMOUNT = 2;
    // uint256 public constant ACTION_INCREASE_UNLOCK_TIME = 3;

    /// @notice function to perform deposit and lock Cake for a user
    /// @param _for The address to be locked and received VECake
    /// @param _amount The amount to deposit
    /// @param _unlockTime New time to unlock Cake. Pass 0 if no change.
    /// @param _prevLockedAmount Existed locks[_for].amount
    /// @param _prevLockedEnd Existed locks[_for].end
    /// @param _actionType The action that user did as this internal function shared among
    /// @param _isCakePoolUser This user is cake pool user or not
    /// several external functions
    function depositFor(
        address _for,
        uint256 _amount,
        uint256 _unlockTime,
        int128 _prevLockedAmount,
        uint256 _prevLockedEnd,
        uint256 _actionType,
        bool _isCakePoolUser
    ) external;

    /// @notice function to perform withdraw and unlock Cake for a user
    /// @param _user The address to be unlocked
    /// @param _prevLockedAmount Existed locks[_user].amount
    /// @param _prevLockedEnd Existed locks[_user].end
    /// @param _withdrawAmount Cake amount
    function unlock(
        address _user,
        int128 _prevLockedAmount,
        uint256 _prevLockedEnd,
        uint256 _withdrawAmount
    ) external;
}
