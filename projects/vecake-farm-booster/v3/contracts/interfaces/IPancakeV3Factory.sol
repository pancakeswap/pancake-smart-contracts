// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IPancakeV3Factory {
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address pool);
}
