// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IPancakeStableSwapDeployer {
    function createSwapPair(
        address _tokenA,
        address _tokenB,
        uint256 _A,
        uint256 _fee,
        uint256 _admin_fee,
        address _admin,
        address _LP
    ) external returns (address);

    function createSwapPair(
        address _tokenA,
        address _tokenB,
        address _tokenC,
        uint256 _A,
        uint256 _fee,
        uint256 _admin_fee,
        address _admin,
        address _LP
    ) external returns (address);
}
