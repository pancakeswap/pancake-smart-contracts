// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/** @title PancakeBunnies.
 * @notice It is the contracts for PancakeSwap NFTs.
 */
contract PancakeBunnies is ERC721, Ownable {
    using Counters for Counters.Counter;

    // Map the number of tokens per bunnyId
    mapping(uint8 => uint256) public bunnyCount;

    // Map the number of tokens burnt per bunnyId
    mapping(uint8 => uint256) public bunnyBurnCount;

    // Used for generating the tokenId of new NFT minted
    Counters.Counter private _tokenIds;

    // Map the bunnyId for each tokenId
    mapping(uint256 => uint8) private bunnyIds;

    // Map the bunnyName for a tokenId
    mapping(uint8 => string) private bunnyNames;

    constructor(string memory _baseURI) public ERC721("Pancake Bunnies", "PB") {
        _setBaseURI(_baseURI);
    }

    /**
     * @dev Get bunnyId for a specific tokenId.
     */
    function getBunnyId(uint256 _tokenId) external view returns (uint8) {
        return bunnyIds[_tokenId];
    }

    /**
     * @dev Get the associated bunnyName for a specific bunnyId.
     */
    function getBunnyName(uint8 _bunnyId) external view returns (string memory) {
        return bunnyNames[_bunnyId];
    }

    /**
     * @dev Get the associated bunnyName for a unique tokenId.
     */
    function getBunnyNameOfTokenId(uint256 _tokenId) external view returns (string memory) {
        uint8 bunnyId = bunnyIds[_tokenId];
        return bunnyNames[bunnyId];
    }

    /**
     * @dev Mint NFTs. Only the owner can call it.
     */
    function mint(
        address _to,
        string calldata _tokenURI,
        uint8 _bunnyId
    ) external onlyOwner returns (uint256) {
        uint256 newId = _tokenIds.current();
        _tokenIds.increment();
        bunnyIds[newId] = _bunnyId;
        bunnyCount[_bunnyId] = bunnyCount[_bunnyId].add(1);
        _mint(_to, newId);
        _setTokenURI(newId, _tokenURI);
        return newId;
    }

    /**
     * @dev Set a unique name for each bunnyId. It is supposed to be called once.
     */
    function setBunnyName(uint8 _bunnyId, string calldata _name) external onlyOwner {
        bunnyNames[_bunnyId] = _name;
    }

    /**
     * @dev Burn a NFT token. Callable by owner only.
     */
    function burn(uint256 _tokenId) external onlyOwner {
        uint8 bunnyIdBurnt = bunnyIds[_tokenId];
        bunnyCount[bunnyIdBurnt] = bunnyCount[bunnyIdBurnt].sub(1);
        bunnyBurnCount[bunnyIdBurnt] = bunnyBurnCount[bunnyIdBurnt].add(1);
        _burn(_tokenId);
    }
}
