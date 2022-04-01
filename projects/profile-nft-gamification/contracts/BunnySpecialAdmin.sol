// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BunnyMintingStation} from "./BunnyMintingStation.sol";

/**
 * @title BunnySpecialAdmin.
 * @notice It is a contract for community admins to claim a special bunny.
 */
contract BunnySpecialAdmin is Ownable {
    BunnyMintingStation public bunnyMintingStation;

    uint8 public constant bunnyId = 21;

    uint256 public endBlock;

    string public tokenURI;

    // Map if address has already claimed a NFT
    mapping(address => bool) public hasClaimed;

    // Map if address can claim NFT
    mapping(address => bool) private _canClaim;

    event BunnyMint(address indexed to, uint256 indexed tokenId, uint8 indexed bunnyId);
    event NewAddressesWhitelisted(address[] users);
    event NewAddressesUnwhitelisted(address[] users);
    event NewEndBlock(uint256 endBlock);

    /**
     * @notice Constructor
     * @param _bunnyMintingStation: address of the bunny minting station
     * @param _endBlock: end block for claiming
     * @param _tokenURI: tokenURI (string)
     */
    constructor(
        address _bunnyMintingStation,
        uint256 _endBlock,
        string memory _tokenURI
    ) public {
        bunnyMintingStation = BunnyMintingStation(_bunnyMintingStation);
        endBlock = _endBlock;
        tokenURI = _tokenURI;
    }

    /**
     * @notice Mint a NFT from the BunnyMintingStation contract.
     * @dev Users can claim once.
     */
    function mintNFT() external {
        require(block.number < endBlock, "Claim: Too late");

        // Check msg.sender has not claimed
        require(!hasClaimed[msg.sender], "Claim: Already claimed");

        require(_canClaim[msg.sender], "Claim: Not eligible");

        // Update that msg.sender has claimed
        hasClaimed[msg.sender] = true;

        // Mint collectible and send it to the user.
        uint256 tokenId = bunnyMintingStation.mintCollectible(msg.sender, tokenURI, bunnyId);

        emit BunnyMint(msg.sender, tokenId, bunnyId);
    }

    /**
     * @notice Change end block for distribution
     * @dev Only callable by owner.
     * @param _endBlock: end block for claiming
     */
    function changeEndBlock(uint256 _endBlock) external onlyOwner {
        endBlock = _endBlock;

        emit NewEndBlock(_endBlock);
    }

    /**
     * @notice Whitelist a list of addresses. Whitelisted addresses can claim the NFT.
     * @dev Only callable by owner.
     * @param _users: list of user addresses
     */
    function whitelistAddresses(address[] calldata _users) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            _canClaim[_users[i]] = true;
        }

        emit NewAddressesWhitelisted(_users);
    }

    /**
     * @notice Unwhitelist a list of addresses.
     * @dev Only callable by owner.
     * @param _users: list of user addresses
     */
    function unwhitelistAddresses(address[] calldata _users) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            _canClaim[_users[i]] = false;
        }

        emit NewAddressesUnwhitelisted(_users);
    }

    /**
     * @notice Return whether a user can claim
     * @param user: user address
     */
    function canClaim(address user) external view returns (bool) {
        return (!hasClaimed[user]) && (_canClaim[user]) && (block.number < endBlock);
    }
}
