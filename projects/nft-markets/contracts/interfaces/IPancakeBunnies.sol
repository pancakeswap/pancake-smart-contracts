// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPancakeBunnies {
    function getBunnyId(uint256 _tokenId) external view returns (uint8);
}
