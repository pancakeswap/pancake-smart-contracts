//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPancakeV3Pool {
    /// @notice The currently in range liquidity available to the pool
    /// @dev This value has no relationship to the total liquidity across all ticks
    function liquidity() external view returns (uint128);
}
