// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IRevenueSharingPool {
    function lastTokenTimestamp() external view returns (uint256);

    function checkpointToken() external;

    function checkpointTotalSupply() external;
}
