// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IRevenueSharingPool.sol";

contract RevenueSharingPoolGateway {
    /// @notice Claim multiple pools for user , with cake pool proxy
    /// @dev If user had cake pool proxy , will claim at the same time
    function claimMultiple(address[] calldata _revenueSharingPools, address _for) external {
        for (uint256 i = 0; i < _revenueSharingPools.length; i++) {
            IRevenueSharingPool(_revenueSharingPools[i]).claim(_for);
        }
    }

    /// @notice Claim multiple pools for user, without cake pool proxy
    /// @dev If user had cake pool proxy , will not claim at the same time
    /// @dev You can use cake pool proxy address as _for , will claim for cake pool proxy
    function claimMultipleWithoutProxy(address[] calldata _revenueSharingPools, address _for) external {
        for (uint256 i = 0; i < _revenueSharingPools.length; i++) {
            IRevenueSharingPool(_revenueSharingPools[i]).claimForUser(_for);
        }
    }
}
