// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ICollectionWhitelistChecker} from "./interfaces/ICollectionWhitelistChecker.sol";
import {IPancakeBunnies} from "./interfaces/IPancakeBunnies.sol";

contract PancakeBunniesWhitelistChecker is Ownable, ICollectionWhitelistChecker {
    IPancakeBunnies public pancakeBunnies;

    mapping(uint8 => bool) public isBunnyIdRestricted;

    event NewRestriction(uint8[] bunnyIds);
    event RemoveRestriction(uint8[] bunnyIds);

    /**
     * @notice Constructor
     * @param _pancakeBunniesAddress: PancakeBunnies contract
     */
    constructor(address _pancakeBunniesAddress) {
        pancakeBunnies = IPancakeBunnies(_pancakeBunniesAddress);
    }

    /**
     * @notice Restrict tokens with specific bunnyIds to be sold
     * @param _bunnyIds: bunnyIds to restrict for trading on the market
     */
    function addRestrictionForBunnies(uint8[] calldata _bunnyIds) external onlyOwner {
        for (uint8 i = 0; i < _bunnyIds.length; i++) {
            require(!isBunnyIdRestricted[_bunnyIds[i]], "Operations: Already restricted");
            isBunnyIdRestricted[_bunnyIds[i]] = true;
        }

        emit NewRestriction(_bunnyIds);
    }

    /**
     * @notice Remove restrictions tokens with specific bunnyIds to be sold
     * @param _bunnyIds: bunnyIds to restrict for trading on the market
     */
    function removeRestrictionForBunnies(uint8[] calldata _bunnyIds) external onlyOwner {
        for (uint8 i = 0; i < _bunnyIds.length; i++) {
            require(isBunnyIdRestricted[_bunnyIds[i]], "Operations: Not restricted");
            isBunnyIdRestricted[_bunnyIds[i]] = false;
        }

        emit RemoveRestriction(_bunnyIds);
    }

    /**
     * @notice Check whether token can be listed
     * @param _tokenId: tokenId of the NFT to list
     */
    function canList(uint256 _tokenId) external view override returns (bool) {
        uint8 bunnyId = pancakeBunnies.getBunnyId(_tokenId);

        return !isBunnyIdRestricted[bunnyId];
    }
}
