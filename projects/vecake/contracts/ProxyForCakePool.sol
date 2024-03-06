// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IVECake.sol";
import "./interfaces/IProxyForCakePoolFactory.sol";

contract ProxyForCakePool {
    IVECake public immutable VECake;
    address public immutable cakePoolUser;

    modifier onlyVECake() {
        require(msg.sender == address(VECake), "Not VECake");
        _;
    }

    /// @notice Constructor
    constructor() {
        (address VECakeAddress, address user) = IProxyForCakePoolFactory(msg.sender).parameters();
        VECake = IVECake(VECakeAddress);
        cakePoolUser = user;
    }

    function createLockForProxy(uint256 _amount, uint256 _unlockTime) external onlyVECake {
        VECake.createLockForProxy(_amount, _unlockTime);
    }

    function withdrawAll() external onlyVECake {
        VECake.withdrawAll(address(this));
    }
}
