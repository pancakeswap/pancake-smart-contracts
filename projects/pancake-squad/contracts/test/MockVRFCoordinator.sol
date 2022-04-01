//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {NFTSale} from "../NFTSale.sol";

/**
 * @dev For testing purposes
 */
contract MockVRFCoordinator {
    NFTSale public saleContract;

    constructor() {
        //
    }

    function changeNFTSaleContract(address _nftSale) external {
        saleContract = NFTSale(_nftSale);
    }

    function rawFulfillRandomness(bytes32 requestId, uint256 randomness) external {
        saleContract.rawFulfillRandomness(requestId, randomness);
    }
}
