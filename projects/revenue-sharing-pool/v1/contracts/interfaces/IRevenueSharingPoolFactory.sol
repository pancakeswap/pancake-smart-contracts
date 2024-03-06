// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IRevenueSharingPoolFactory {
    function parameters()
        external
        view
        returns (
            address VCake,
            uint256 startTime,
            address rewardToken,
            address emergencyReturn,
            address owner
        );
}
