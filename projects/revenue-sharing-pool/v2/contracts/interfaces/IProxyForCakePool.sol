// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IProxyForCakePool {
    function cakePoolUser() external view returns (address);
}
