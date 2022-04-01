// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Pancake Squad
 * @notice PancakeSwap NFT collection
 */
contract PancakeSquad is ERC721Enumerable, Ownable {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    uint256 public immutable maxSupply;

    bool public isLocked;
    string public baseURI;

    event Lock();
    event NonFungibleTokenRecovery(address indexed token, uint256 tokenId);
    event TokenRecovery(address indexed token, uint256 amount);

    /**
     * @notice Constructor
     * @param _name: NFT name
     * @param _symbol: NFT symbol
     * @param _maxSupply: NFT max totalSupply
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _maxSupply
    ) ERC721(_name, _symbol) {
        require((_maxSupply == 100) || (_maxSupply == 1000) || (_maxSupply == 10000), "Operations: Wrong max supply");
        maxSupply = _maxSupply;
    }

    /**
     * @notice Allows the owner to lock the contract
     * @dev Callable by owner
     */
    function lock() external onlyOwner {
        require(!isLocked, "Operations: Contract is locked");
        isLocked = true;
        emit Lock();
    }

    /**
     * @notice Allows the owner to mint a token to a specific address
     * @param _to: address to receive the token
     * @param _tokenId: tokenId
     * @dev Callable by owner
     */
    function mint(address _to, uint256 _tokenId) external onlyOwner {
        require(totalSupply() < maxSupply, "NFT: Total supply reached");
        _mint(_to, _tokenId);
    }

    /**
     * @notice Allows the owner to recover non-fungible tokens sent to the contract by mistake
     * @param _token: NFT token address
     * @param _tokenId: tokenId
     * @dev Callable by owner
     */
    function recoverNonFungibleToken(address _token, uint256 _tokenId) external onlyOwner {
        IERC721(_token).transferFrom(address(this), address(msg.sender), _tokenId);

        emit NonFungibleTokenRecovery(_token, _tokenId);
    }

    /**
     * @notice Allows the owner to recover tokens sent to the contract by mistake
     * @param _token: token address
     * @dev Callable by owner
     */
    function recoverToken(address _token) external onlyOwner {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance != 0, "Operations: Cannot recover zero balance");

        IERC20(_token).safeTransfer(address(msg.sender), balance);

        emit TokenRecovery(_token, balance);
    }

    /**
     * @notice Allows the owner to set the base URI to be used for all token IDs
     * @param _uri: base URI (preferably IPFS)
     * @dev Callable by owner
     */
    function setBaseURI(string memory _uri) external onlyOwner {
        require(!isLocked, "Operations: Contract is locked");
        baseURI = _uri;
    }

    /**
     * @notice Returns a list of token IDs owned by `user` given a `cursor` and `size` of its token list
     * @param user: address
     * @param cursor: cursor
     * @param size: size
     */
    function tokensOfOwnerBySize(
        address user,
        uint256 cursor,
        uint256 size
    ) external view returns (uint256[] memory, uint256) {
        uint256 length = size;
        if (length > balanceOf(user) - cursor) {
            length = balanceOf(user) - cursor;
        }

        uint256[] memory values = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            values[i] = tokenOfOwnerByIndex(user, cursor + i);
        }

        return (values, cursor + length);
    }

    /**
     * @notice Returns the Uniform Resource Identifier (URI) for a token ID
     * @param tokenId: token ID
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");

        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, tokenId.toString(), ".json")) : "";
    }
}
