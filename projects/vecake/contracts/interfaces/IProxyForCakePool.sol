// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IProxyForCakePool {
    function createLockForProxy(uint256 _amount, uint256 _unlockTime) external;

    function withdrawAll() external;
}
