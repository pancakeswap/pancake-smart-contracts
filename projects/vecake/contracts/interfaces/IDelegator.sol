// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IDelegator {
    /// @notice Delegate in delegator smart contract.
    /// @param user The user address
    /// @param amount The delegated cake amount
    /// @param lockEndTime The lock end time in cake pool.
    function delegate(
        address user,
        uint256 amount,
        uint256 lockEndTime
    ) external;
}
