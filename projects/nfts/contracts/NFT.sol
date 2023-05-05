// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFT is ERC721Enumerable, Ownable {

    uint256 public nextTokenId = 0;
    uint256 constant MAX_AMOUNT = 150;

    constructor() 
    ERC721("NFT","NFT")
    Ownable() {
    }

    function mintBatch(address[] memory to) external onlyOwner() {
        for(uint i = 0; i < to.length; i++)
            _safeMint(to[i], nextTokenId++);
    }
}
