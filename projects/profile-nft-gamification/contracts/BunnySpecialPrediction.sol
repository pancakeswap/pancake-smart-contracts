// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "predictions/contracts/BnbPricePrediction.sol";

import "./BunnyMintingStation.sol";
import "./PancakeProfile.sol";

/**
 * @title BunnySpecialPrediction.
 * @notice It is a contract for users to mint exclusive
 * collectibles if they participated in Prediction beta.
 */
contract BunnySpecialPrediction is Ownable {
    using SafeMath for uint256;

    BunnyMintingStation public bunnyMintingStation;
    PancakeProfile public pancakeProfile;
    BnbPricePrediction public pancakePrediction;

    uint8 public constant bunnyId = 17;

    // Collectible-related.
    uint256 public endBlock;
    uint256 public thresholdRound;

    // PancakeSwap Profile related.
    uint256 public numberPoints;
    uint256 public campaignId;

    string public tokenURI;

    // Map if address has already claimed a NFT
    mapping(address => bool) public hasClaimed;

    event BunnyMint(address indexed to, uint256 indexed tokenId, uint8 indexed bunnyId);
    event NewEndBlock(uint256 endBlock);
    event NewThresholdRound(uint256 thresholdRound);
    event NewNumberPoints(uint256 numberPoints);
    event NewCampaignId(uint256 campaignId);

    constructor(
        address _pancakePrediction,
        address _bunnyMintingStation,
        address _pancakeProfile,
        uint256 _endBlock,
        uint256 _thresholdRound,
        uint256 _numberPoints,
        uint256 _campaignId,
        string memory _tokenURI
    ) public {
        pancakePrediction = BnbPricePrediction(_pancakePrediction);
        bunnyMintingStation = BunnyMintingStation(_bunnyMintingStation);
        pancakeProfile = PancakeProfile(_pancakeProfile);
        endBlock = _endBlock;
        thresholdRound = _thresholdRound;
        numberPoints = _numberPoints;
        campaignId = _campaignId;
        tokenURI = _tokenURI;
    }

    /**
     * @notice Mint a NFT from the BunnyMintingStation contract.
     * @dev Users can claim once. It maps to the teamId.
     */
    function mintNFT() external {
        require(block.number < endBlock, "TOO_LATE");

        // Check that msg.sender has not claimed
        require(!hasClaimed[msg.sender], "ERR_HAS_CLAIMED");

        bool isUserActive;
        (, , , , , isUserActive) = pancakeProfile.getUserProfile(msg.sender);

        // Check that msg.sender has an active profile
        require(isUserActive, "ERR_USER_NOT_ACTIVE");

        bool isUserEligible;
        isUserEligible = _canClaim(msg.sender);

        // Check that msg.sender is eligible
        require(isUserEligible, "ERR_USER_NOT_ELIGIBLE");

        // Update that msg.sender has claimed
        hasClaimed[msg.sender] = true;

        // Mint collectible and send it to the user.
        uint256 tokenId = bunnyMintingStation.mintCollectible(msg.sender, tokenURI, bunnyId);

        // Increase point on PancakeSwap profile, for a given campaignId.
        pancakeProfile.increaseUserPoints(msg.sender, numberPoints, campaignId);

        emit BunnyMint(msg.sender, tokenId, bunnyId);
    }

    /**
     * @notice Change the campaignId for PancakeSwap Profile.
     * @dev Only callable by owner.
     */
    function changeCampaignId(uint256 _campaignId) external onlyOwner {
        campaignId = _campaignId;

        emit NewCampaignId(_campaignId);
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
     * @notice Change the number of points for PancakeSwap Profile.
     * @dev Only callable by owner.
     */
    function changeNumberPoints(uint256 _numberPoints) external onlyOwner {
        numberPoints = _numberPoints;

        emit NewNumberPoints(_numberPoints);
    }

    /**
     * @notice Change Round ID (Prediction) threshold
     * @dev Only callable by owner.
     */
    function changeThresholdRound(uint256 _thresholdRound) external onlyOwner {
        thresholdRound = _thresholdRound;

        emit NewThresholdRound(_thresholdRound);
    }

    /**
     * @notice Check if a user can claim.
     */
    function canClaim(address _userAddress) external view returns (bool) {
        return _canClaim(_userAddress);
    }

    /**
     * @notice Check if a user can claim.
     */
    function _canClaim(address _userAddress) internal view returns (bool) {
        if (hasClaimed[_userAddress]) {
            return false;
        } else {
            if (!pancakeProfile.getUserStatus(_userAddress)) {
                return false;
            } else {
                uint256[] memory roundId;
                (roundId, ) = pancakePrediction.getUserRounds(_userAddress, 0, 1);

                if (roundId.length > 0) {
                    if (roundId[0] <= thresholdRound) {
                        return true;
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }
        }
    }
}
