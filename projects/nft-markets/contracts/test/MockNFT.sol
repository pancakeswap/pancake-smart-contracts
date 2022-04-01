// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/** @title MockNFT.
 * @notice It is a mock NFT contract
 */
contract MockNFT is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;

    // Used for generating the tokenId of a newly NFT minted
    Counters.Counter private _tokenIdCounter;

    /**
     * @notice Constructor
     * @param _name: name of NFT (e.g. "Mock NFT")
     * @param _symbol: symbol of NFT (e.g. "MN")
     */
    constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {
        //
    }

    /**
     * @notice Mint NFTs to caller. Anyone can call it.
     */
    function mint(string calldata _tokenURI) external {
        _mint(address(msg.sender), _tokenIdCounter.current());
        _setTokenURI(_tokenIdCounter.current(), _tokenURI);
        _tokenIdCounter.increment();
    }
}
