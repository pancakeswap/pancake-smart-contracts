// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IFarmBoosterV1 {
    /// @notice Record user token position liquidity
    /// @dev Only record the positions which have updated after fram booster set in MasterChef V3.
    /// mapping(address => mapping(uint256 => uint256)) public userPositionLiquidity;
    function userPositionLiquidity(address user, uint256 tokenId) external view returns (uint256 liquidity);

    /// @notice Record user total liquidity in MasterChef V3 pool
    /// mapping(address => mapping(uint256 => uint256)) public userPoolTotalLiquidity;
    function userPoolTotalLiquidity(address user, uint256 poolId) external view returns (uint256 totalLiquidity);
}
