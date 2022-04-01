// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "bsc-library/contracts/IBEP20.sol";
import "bsc-library/contracts/SafeBEP20.sol";

import "../PancakeBunnies.sol";

contract BunnyMintingFarm is Ownable {
    using SafeMath for uint8;
    using SafeMath for uint256;

    using SafeBEP20 for IBEP20;

    PancakeBunnies public pancakeBunnies;
    IBEP20 public cakeToken;

    // Map if address can claim a NFT
    mapping(address => bool) public canClaim;

    // Map if address has already claimed a NFT
    mapping(address => bool) public hasClaimed;

    // starting block
    uint256 public startBlockNumber;

    // end block number to claim CAKEs by burning NFT
    uint256 public endBlockNumber;

    // number of total bunnies burnt
    uint256 public countBunniesBurnt;

    // Number of CAKEs a user can collect by burning her NFT
    uint256 public cakePerBurn;

    // current distributed number of NFTs
    uint256 public currentDistributedSupply;

    // number of total NFTs distributed
    uint256 public totalSupplyDistributed;

    // baseURI (on IPFS)
    string private baseURI;

    // Map the token number to URI
    mapping(uint8 => string) private bunnyIdURIs;

    // number of initial series (i.e. different visuals)
    uint8 private numberOfBunnyIds;

    // Event to notify when NFT is successfully minted
    event BunnyMint(address indexed to, uint256 indexed tokenId, uint8 indexed bunnyId);

    // Event to notify when NFT is successfully minted
    event BunnyBurn(address indexed from, uint256 indexed tokenId);

    /**
     * @dev A maximum number of NFT tokens that is distributed by this contract
     * is defined as totalSupplyDistributed.
     */
    constructor(
        IBEP20 _cakeToken,
        uint256 _totalSupplyDistributed,
        uint256 _cakePerBurn,
        string memory _baseURI,
        string memory _ipfsHash,
        uint256 _endBlockNumber
    ) public {
        pancakeBunnies = new PancakeBunnies(_baseURI);
        cakeToken = _cakeToken;
        totalSupplyDistributed = _totalSupplyDistributed;
        cakePerBurn = _cakePerBurn;
        baseURI = _baseURI;
        endBlockNumber = _endBlockNumber;

        // Other parameters initialized
        numberOfBunnyIds = 5;

        // Assign tokenURI to look for each bunnyId in the mint function
        bunnyIdURIs[0] = string(abi.encodePacked(_ipfsHash, "swapsies.json"));
        bunnyIdURIs[1] = string(abi.encodePacked(_ipfsHash, "drizzle.json"));
        bunnyIdURIs[2] = string(abi.encodePacked(_ipfsHash, "blueberries.json"));
        bunnyIdURIs[3] = string(abi.encodePacked(_ipfsHash, "circular.json"));
        bunnyIdURIs[4] = string(abi.encodePacked(_ipfsHash, "sparkle.json"));

        // Set token names for each bunnyId
        pancakeBunnies.setBunnyName(0, "Swapsies");
        pancakeBunnies.setBunnyName(1, "Drizzle");
        pancakeBunnies.setBunnyName(2, "Blueberries");
        pancakeBunnies.setBunnyName(3, "Circular");
        pancakeBunnies.setBunnyName(4, "Sparkle");
    }

    /**
     * @dev Mint NFTs from the PancakeBunnies contract.
     * Users can specify what bunnyId they want to mint. Users can claim once.
     * There is a limit on how many are distributed. It requires CAKE balance to be >0.
     */
    function mintNFT(uint8 _bunnyId) external {
        // Check msg.sender can claim
        require(canClaim[msg.sender], "Cannot claim");
        // Check msg.sender has not claimed
        require(hasClaimed[msg.sender] == false, "Has claimed");
        // Check whether it is still possible to mint
        require(currentDistributedSupply < totalSupplyDistributed, "Nothing left");
        // Check whether user owns any CAKE
        require(cakeToken.balanceOf(msg.sender) > 0, "Must own CAKE");
        // Check that the _bunnyId is within boundary:
        require(_bunnyId < numberOfBunnyIds, "bunnyId unavailable");
        // Update that msg.sender has claimed
        hasClaimed[msg.sender] = true;

        // Update the currentDistributedSupply by 1
        currentDistributedSupply = currentDistributedSupply.add(1);

        string memory tokenURI = bunnyIdURIs[_bunnyId];

        uint256 tokenId = pancakeBunnies.mint(address(msg.sender), tokenURI, _bunnyId);

        emit BunnyMint(msg.sender, tokenId, _bunnyId);
    }

    /**
     * @dev Burn NFT from the PancakeBunnies contract.
     * Users can burn their NFT to get a set number of CAKE.
     * There is a cap on how many can be distributed for free.
     */
    function burnNFT(uint256 _tokenId) external {
        require(pancakeBunnies.ownerOf(_tokenId) == msg.sender, "Not the owner");
        require(block.number < endBlockNumber, "too late");

        pancakeBunnies.burn(_tokenId);
        countBunniesBurnt = countBunniesBurnt.add(1);
        cakeToken.safeTransfer(address(msg.sender), cakePerBurn);
        emit BunnyBurn(msg.sender, _tokenId);
    }

    /**
     * @dev Allow to set up the start number
     * Only the owner can set it.
     */
    function setStartBlockNumber() external onlyOwner {
        startBlockNumber = block.number;
    }

    /**
     * @dev Allow the contract owner to whitelist addresses.
     * Only these addresses can claim.
     */
    function whitelistAddresses(address[] calldata users) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) {
            canClaim[users[i]] = true;
        }
    }

    /**
     * @dev It transfers the CAKE tokens back to the chef address.
     * Only callable by the owner.
     */
    function withdrawCake(uint256 _amount) external onlyOwner {
        require(block.number >= endBlockNumber, "too early");
        cakeToken.safeTransfer(address(msg.sender), _amount);
    }

    /**
     * @dev It transfers the ownership of the NFT contract
     * to a new address.
     */
    function changeOwnershipNFTContract(address _newOwner) external onlyOwner {
        pancakeBunnies.transferOwnership(_newOwner);
    }
}
