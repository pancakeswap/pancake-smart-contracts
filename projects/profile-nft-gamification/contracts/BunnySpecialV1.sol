// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "bsc-library/contracts/IBEP20.sol";
import "bsc-library/contracts/SafeBEP20.sol";

import "./BunnyMintingStation.sol";
import "./PancakeProfile.sol";

/** @title BunnySpecialV1.
 * @notice It is a contract for users to mint exclusive NFTs
 * based on a CAKE price and userId.
 */
contract BunnySpecialV1 is Ownable {
    using SafeBEP20 for IBEP20;
    using SafeMath for uint256;

    BunnyMintingStation public bunnyMintingStation;
    PancakeProfile public pancakeProfile;

    IBEP20 public cakeToken;

    uint256 public maxViewLength;
    uint256 public numberDifferentBunnies;

    // Map if address for a bunnyId has already claimed a NFT
    mapping(address => mapping(uint8 => bool)) public hasClaimed;

    // Map if bunnyId to its characteristics
    mapping(uint8 => Bunnies) public bunnyCharacteristics;

    // Number of previous series (i.e. different visuals)
    uint8 private constant previousNumberBunnyIds = 10;

    struct Bunnies {
        string tokenURI; // e.g. ipfsHash/hiccups.json
        uint256 thresholdUser; // e.g. 1900 or 100000
        uint256 cakeCost;
        bool isActive;
        bool isCreated;
    }

    // Event to notify a new bunny is mintable
    event BunnyAdd(uint8 indexed bunnyId, uint256 thresholdUser, uint256 costCake);

    // Event to notify one of the bunnies' requirements to mint differ
    event BunnyChange(uint8 indexed bunnyId, uint256 thresholdUser, uint256 costCake, bool isActive);

    // Event to notify when NFT is successfully minted
    event BunnyMint(address indexed to, uint256 indexed tokenId, uint8 indexed bunnyId);

    constructor(
        BunnyMintingStation _bunnyMintingStation,
        IBEP20 _cakeToken,
        PancakeProfile _pancakeProfile,
        uint256 _maxViewLength
    ) public {
        bunnyMintingStation = _bunnyMintingStation;
        cakeToken = _cakeToken;
        pancakeProfile = _pancakeProfile;
        maxViewLength = _maxViewLength;
    }

    /**
     * @dev Mint NFTs from the BunnyMintingStation contract.
     * Users can claim once.
     */
    function mintNFT(uint8 _bunnyId) external {
        // Check that the _bunnyId is within boundary
        require(_bunnyId >= previousNumberBunnyIds, "ERR_ID_LOW");
        require(bunnyCharacteristics[_bunnyId].isActive, "ERR_ID_INVALID");

        address senderAddress = _msgSender();

        // 1. Check _msgSender() has not claimed
        require(!hasClaimed[senderAddress][_bunnyId], "ERR_HAS_CLAIMED");

        uint256 userId;
        bool isUserActive;

        (userId, , , , , isUserActive) = pancakeProfile.getUserProfile(senderAddress);

        require(userId < bunnyCharacteristics[_bunnyId].thresholdUser, "ERR_USER_NOT_ELIGIBLE");

        require(isUserActive, "ERR_USER_NOT_ACTIVE");

        // Check if there is any cost associated with getting the bunny
        if (bunnyCharacteristics[_bunnyId].cakeCost > 0) {
            cakeToken.safeTransferFrom(senderAddress, address(this), bunnyCharacteristics[_bunnyId].cakeCost);
        }

        // Update that _msgSender() has claimed
        hasClaimed[senderAddress][_bunnyId] = true;

        uint256 tokenId = bunnyMintingStation.mintCollectible(
            senderAddress,
            bunnyCharacteristics[_bunnyId].tokenURI,
            _bunnyId
        );

        emit BunnyMint(senderAddress, tokenId, _bunnyId);
    }

    function addBunny(
        uint8 _bunnyId,
        string calldata _tokenURI,
        uint256 _thresholdUser,
        uint256 _cakeCost
    ) external onlyOwner {
        require(!bunnyCharacteristics[_bunnyId].isCreated, "ERR_CREATED");
        require(_bunnyId >= previousNumberBunnyIds, "ERR_ID_LOW_2");

        bunnyCharacteristics[_bunnyId] = Bunnies({
            tokenURI: _tokenURI,
            thresholdUser: _thresholdUser,
            cakeCost: _cakeCost,
            isActive: true,
            isCreated: true
        });

        numberDifferentBunnies = numberDifferentBunnies.add(1);

        emit BunnyAdd(_bunnyId, _thresholdUser, _cakeCost);
    }

    /**
     * @dev It transfers the CAKE tokens back to the chef address.
     * Only callable by the owner.
     */
    function claimFee(uint256 _amount) external onlyOwner {
        cakeToken.safeTransfer(_msgSender(), _amount);
    }

    function updateBunny(
        uint8 _bunnyId,
        uint256 _thresholdUser,
        uint256 _cakeCost,
        bool _isActive
    ) external onlyOwner {
        require(bunnyCharacteristics[_bunnyId].isCreated, "ERR_NOT_CREATED");
        bunnyCharacteristics[_bunnyId].thresholdUser = _thresholdUser;
        bunnyCharacteristics[_bunnyId].cakeCost = _cakeCost;
        bunnyCharacteristics[_bunnyId].isActive = _isActive;

        emit BunnyChange(_bunnyId, _thresholdUser, _cakeCost, _isActive);
    }

    function updateMaxViewLength(uint256 _newMaxViewLength) external onlyOwner {
        maxViewLength = _newMaxViewLength;
    }

    function canClaimSingle(address _userAddress, uint8 _bunnyId) external view returns (bool) {
        if (!pancakeProfile.hasRegistered(_userAddress)) {
            return false;
        } else {
            uint256 userId;
            bool userStatus;

            (userId, , , , , userStatus) = pancakeProfile.getUserProfile(_userAddress);

            if (!userStatus) {
                return false;
            } else {
                bool claimStatus = _canClaim(_userAddress, userId, _bunnyId);
                return claimStatus;
            }
        }
    }

    function canClaimMultiple(address _userAddress, uint8[] calldata _bunnyIds) external view returns (bool[] memory) {
        require(_bunnyIds.length <= maxViewLength, "ERR_LENGTH_VIEW");

        if (!pancakeProfile.hasRegistered(_userAddress)) {
            bool[] memory responses = new bool[](0);
            return responses;
        } else {
            uint256 userId;
            bool userStatus;

            (userId, , , , , userStatus) = pancakeProfile.getUserProfile(_userAddress);

            if (!userStatus) {
                bool[] memory responses = new bool[](0);
                return responses;
            } else {
                bool[] memory responses = new bool[](_bunnyIds.length);

                for (uint256 i = 0; i < _bunnyIds.length; i++) {
                    bool claimStatus = _canClaim(_userAddress, userId, _bunnyIds[i]);
                    responses[i] = claimStatus;
                }
                return responses;
            }
        }
    }

    /**
     * @dev Check if user can claim.
     * If the address hadn't set up a profile, it will return an error.
     */
    function _canClaim(
        address _userAddress,
        uint256 userId,
        uint8 _bunnyId
    ) internal view returns (bool) {
        uint256 bunnyThreshold = bunnyCharacteristics[_bunnyId].thresholdUser;
        bool bunnyActive = bunnyCharacteristics[_bunnyId].isActive;

        if (hasClaimed[_userAddress][_bunnyId]) {
            return false;
        } else if (!bunnyActive) {
            return false;
        } else if (userId >= bunnyThreshold) {
            return false;
        } else {
            return true;
        }
    }
}
