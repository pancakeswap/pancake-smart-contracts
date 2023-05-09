// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWeth9 is IERC20 {
    function deposit() external payable;

    function withdraw(uint256 wad) external;
}
