// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./PancakeBunnies.sol";

/** @title BunnyMintingStation.
 * @dev This contract allows different factories to mint
 * Pancake Collectibles/Bunnies.
 */
contract BunnyMintingStation is AccessControl {
    PancakeBunnies public pancakeBunnies;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // Modifier for minting roles
    modifier onlyMinter() {
        require(hasRole(MINTER_ROLE, _msgSender()), "Not a minting role");
        _;
    }

    // Modifier for admin roles
    modifier onlyOwner() {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Not an admin role");
        _;
    }

    constructor(PancakeBunnies _pancakeBunnies) public {
        pancakeBunnies = _pancakeBunnies;
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /**
     * @notice Mint NFTs from the PancakeBunnies contract.
     * Users can specify what bunnyId they want to mint. Users can claim once.
     * There is a limit on how many are distributed. It requires CAKE balance to be > 0.
     */
    function mintCollectible(
        address _tokenReceiver,
        string calldata _tokenURI,
        uint8 _bunnyId
    ) external onlyMinter returns (uint256) {
        uint256 tokenId = pancakeBunnies.mint(_tokenReceiver, _tokenURI, _bunnyId);
        return tokenId;
    }

    /**
     * @notice Set up names for bunnies.
     * @dev Only the main admins can set it.
     */
    function setBunnyName(uint8 _bunnyId, string calldata _bunnyName) external onlyOwner {
        pancakeBunnies.setBunnyName(_bunnyId, _bunnyName);
    }

    /**
     * @dev It transfers the ownership of the NFT contract to a new address.
     * @dev Only the main admins can set it.
     */
    function changeOwnershipNFTContract(address _newOwner) external onlyOwner {
        pancakeBunnies.transferOwnership(_newOwner);
    }
}
