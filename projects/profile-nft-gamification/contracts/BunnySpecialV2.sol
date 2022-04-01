// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "bsc-library/contracts/IBEP20.sol";
import "bsc-library/contracts/SafeBEP20.sol";

import "./BunnyMintingStation.sol";
import "./PancakeProfile.sol";

/** @title BunnySpecialV2.
 * @notice It is a contract for users to mint exclusive Easter
 * collectibles for their teams.
 */
contract BunnySpecialV2 is Ownable {
    using SafeBEP20 for IBEP20;
    using SafeMath for uint256;

    BunnyMintingStation public bunnyMintingStation;
    PancakeProfile public pancakeProfile;

    IBEP20 public cakeToken;

    uint8 public constant previousNumberBunnyIds = 12;

    uint256 public endBlock;
    uint256 public thresholdUser;

    // Map if bunnyId to its tokenURI
    mapping(uint8 => string) public bunnyTokenURI;

    // Map if address has already claimed a NFT
    mapping(address => bool) public hasClaimed;

    // Map teamId to its bunnyId
    mapping(uint256 => uint8) public teamIdToBunnyId;

    event BunnyAdd(uint8 bunnyId, uint256 teamId);

    // Event to notify when NFT is successfully minted
    event BunnyMint(address indexed to, uint256 indexed tokenId, uint8 indexed bunnyId);

    event NewEndBlock(uint256 endBlock);
    event NewThresholdUser(uint256 thresholdUser);

    constructor(
        BunnyMintingStation _bunnyMintingStation,
        IBEP20 _cakeToken,
        PancakeProfile _pancakeProfile,
        uint256 _thresholdUser,
        uint256 _endBlock
    ) public {
        bunnyMintingStation = _bunnyMintingStation;
        cakeToken = _cakeToken;
        pancakeProfile = _pancakeProfile;
        thresholdUser = _thresholdUser;
        endBlock = _endBlock;
    }

    /**
     * @notice Mint a NFT from the BunnyMintingStation contract.
     * @dev Users can claim once. It maps to the teamId.
     */
    function mintNFT() external {
        require(block.number < endBlock, "TOO_LATE");

        address senderAddress = _msgSender();

        // Check _msgSender() has not claimed
        require(!hasClaimed[senderAddress], "ERR_HAS_CLAIMED");

        uint256 userId;
        uint256 userTeamId;
        bool isUserActive;

        (userId, , userTeamId, , , isUserActive) = pancakeProfile.getUserProfile(senderAddress);

        require(userId < thresholdUser, "ERR_USER_NOT_ELIGIBLE");
        require(isUserActive, "ERR_USER_NOT_ACTIVE");

        // Update that _msgSender() has claimed
        hasClaimed[senderAddress] = true;

        uint8 bunnyId = teamIdToBunnyId[userTeamId];

        require(bunnyId >= previousNumberBunnyIds, "NOT_VALID");

        string memory tokenURI = bunnyTokenURI[bunnyId];

        uint256 tokenId = bunnyMintingStation.mintCollectible(senderAddress, tokenURI, bunnyId);

        emit BunnyMint(senderAddress, tokenId, bunnyId);
    }

    /**
     * @notice Add/modify bunnyId for a teamId and metadata
     * @dev Only callable by owner.
     */
    function addBunny(
        uint8 _bunnyId,
        uint256 _teamId,
        string calldata _tokenURI
    ) external onlyOwner {
        require(_bunnyId >= previousNumberBunnyIds, "ERR_ID_LOW_2");

        teamIdToBunnyId[_teamId] = _bunnyId;
        bunnyTokenURI[_bunnyId] = _tokenURI;

        emit BunnyAdd(_bunnyId, _teamId);
    }

    /**
     * @notice Change end block for distribution
     * @dev Only callable by owner.
     */
    function changeEndBlock(uint256 _endBlock) external onlyOwner {
        endBlock = _endBlock;
        emit NewEndBlock(_endBlock);
    }

    /**
     * @notice Change user threshold
     * @dev Only callable by owner.
     */
    function changeThresholdUser(uint256 _thresholdUser) external onlyOwner {
        thresholdUser = _thresholdUser;
        emit NewThresholdUser(_thresholdUser);
    }

    /**
     * @notice Check if a user can claim.
     */
    function canClaim(address _userAddress) external view returns (bool) {
        if (hasClaimed[_userAddress]) {
            return false;
        } else {
            if (!pancakeProfile.getUserStatus(_userAddress)) {
                return false;
            } else {
                uint256 userId;
                (userId, , , , , ) = pancakeProfile.getUserProfile(_userAddress);

                if (userId < thresholdUser) {
                    return true;
                } else {
                    return false;
                }
            }
        }
    }
}
