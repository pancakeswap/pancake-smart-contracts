// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface ICakePool {
    function userInfo(address user)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            bool,
            uint256
        );

    function totalShares() external view returns (uint256);

    function totalBoostDebt() external view returns (uint256);

    function balanceOf() external view returns (uint256);

    function available() external view returns (uint256);

    function VCake() external view returns (address);
}
