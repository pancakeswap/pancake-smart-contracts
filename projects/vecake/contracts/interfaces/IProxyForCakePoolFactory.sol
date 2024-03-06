// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IProxyForCakePoolFactory {
    function parameters() external view returns (address VECake, address user);

    /// @notice Deploy proxy for cake pool
    /// @param _user: Cake pool user
    /// @return proxy The proxy address
    function deploy(address _user) external returns (address proxy);
}
