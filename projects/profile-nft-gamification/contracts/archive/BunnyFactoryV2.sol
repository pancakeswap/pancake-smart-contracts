// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "bsc-library/contracts/IBEP20.sol";

import "bsc-library/contracts/SafeBEP20.sol";

import "../PancakeBunnies.sol";

contract BunnyFactoryV2 is Ownable {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    PancakeBunnies public pancakeBunnies;
    IBEP20 public cakeToken;

    // end block number to get collectibles
    uint256 public endBlockNumber;

    // starting block
    uint256 public startBlockNumber;

    // Number of CAKEs a user needs to pay to acquire a token
    uint256 public tokenPrice;

    // Map if address has already claimed a NFT
    mapping(address => bool) public hasClaimed;

    // IPFS hash for new json
    string private ipfsHash;

    // number of total series (i.e. different visuals)
    uint8 private constant numberBunnyIds = 10;

    // number of previous series (i.e. different visuals)
    uint8 private constant previousNumberBunnyIds = 5;

    // Map the token number to URI
    mapping(uint8 => string) private bunnyIdURIs;

    // Event to notify when NFT is successfully minted
    event BunnyMint(address indexed to, uint256 indexed tokenId, uint8 indexed bunnyId);

    /**
     * @dev A maximum number of NFT tokens that is distributed by this contract
     * is defined as totalSupplyDistributed.
     */
    constructor(
        PancakeBunnies _pancakeBunnies,
        IBEP20 _cakeToken,
        uint256 _tokenPrice,
        string memory _ipfsHash,
        uint256 _startBlockNumber,
        uint256 _endBlockNumber
    ) public {
        pancakeBunnies = _pancakeBunnies;
        cakeToken = _cakeToken;
        tokenPrice = _tokenPrice;
        ipfsHash = _ipfsHash;
        startBlockNumber = _startBlockNumber;
        endBlockNumber = _endBlockNumber;
    }

    /**
     * @dev Mint NFTs from the PancakeBunnies contract.
     * Users can specify what bunnyId they want to mint. Users can claim once.
     * There is a limit on how many are distributed. It requires CAKE balance to be > 0.
     */
    function mintNFT(uint8 _bunnyId) external {
        // Check _msgSender() has not claimed
        require(!hasClaimed[_msgSender()], "Has claimed");
        // Check block time is not too late
        require(block.number > startBlockNumber, "too early");
        // Check block time is not too late
        require(block.number < endBlockNumber, "too late");
        // Check that the _bunnyId is within boundary:
        require(_bunnyId >= previousNumberBunnyIds, "bunnyId too low");
        // Check that the _bunnyId is within boundary:
        require(_bunnyId < numberBunnyIds, "bunnyId too high");

        // Update that _msgSender() has claimed
        hasClaimed[_msgSender()] = true;

        // Send CAKE tokens to this contract
        cakeToken.safeTransferFrom(address(_msgSender()), address(this), tokenPrice);

        string memory tokenURI = bunnyIdURIs[_bunnyId];

        uint256 tokenId = pancakeBunnies.mint(address(_msgSender()), tokenURI, _bunnyId);

        emit BunnyMint(_msgSender(), tokenId, _bunnyId);
    }

    /**
     * @dev It transfers the ownership of the NFT contract
     * to a new address.
     */
    function changeOwnershipNFTContract(address _newOwner) external onlyOwner {
        pancakeBunnies.transferOwnership(_newOwner);
    }

    /**
     * @dev It transfers the CAKE tokens back to the chef address.
     * Only callable by the owner.
     */
    function claimFee(uint256 _amount) external onlyOwner {
        cakeToken.safeTransfer(_msgSender(), _amount);
    }

    /**
     * @dev Set up json extensions for bunnies 5-9
     * Assign tokenURI to look for each bunnyId in the mint function
     * Only the owner can set it.
     */
    function setBunnyJson(
        string calldata _bunnyId5Json,
        string calldata _bunnyId6Json,
        string calldata _bunnyId7Json,
        string calldata _bunnyId8Json,
        string calldata _bunnyId9Json
    ) external onlyOwner {
        bunnyIdURIs[5] = string(abi.encodePacked(ipfsHash, _bunnyId5Json));
        bunnyIdURIs[6] = string(abi.encodePacked(ipfsHash, _bunnyId6Json));
        bunnyIdURIs[7] = string(abi.encodePacked(ipfsHash, _bunnyId7Json));
        bunnyIdURIs[8] = string(abi.encodePacked(ipfsHash, _bunnyId8Json));
        bunnyIdURIs[9] = string(abi.encodePacked(ipfsHash, _bunnyId9Json));
    }

    /**
     * @dev Set up names for bunnies 5-9
     * Only the owner can set it.
     */
    function setBunnyNames(
        string calldata _bunnyId5,
        string calldata _bunnyId6,
        string calldata _bunnyId7,
        string calldata _bunnyId8,
        string calldata _bunnyId9
    ) external onlyOwner {
        pancakeBunnies.setBunnyName(5, _bunnyId5);
        pancakeBunnies.setBunnyName(6, _bunnyId6);
        pancakeBunnies.setBunnyName(7, _bunnyId7);
        pancakeBunnies.setBunnyName(8, _bunnyId8);
        pancakeBunnies.setBunnyName(9, _bunnyId9);
    }

    /**
     * @dev Allow to set up the start number
     * Only the owner can set it.
     */
    function setStartBlockNumber(uint256 _newStartBlockNumber) external onlyOwner {
        require(_newStartBlockNumber > block.number, "too short");
        startBlockNumber = _newStartBlockNumber;
    }

    /**
     * @dev Allow to set up the end block number
     * Only the owner can set it.
     */
    function setEndBlockNumber(uint256 _newEndBlockNumber) external onlyOwner {
        require(_newEndBlockNumber > block.number, "too short");
        require(_newEndBlockNumber > startBlockNumber, "must be > startBlockNumber");
        endBlockNumber = _newEndBlockNumber;
    }

    /**
     * @dev Allow to change the token price
     * Only the owner can set it.
     */
    function updateTokenPrice(uint256 _newTokenPrice) external onlyOwner {
        tokenPrice = _newTokenPrice;
    }
}
