// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "pancake-cake-vault/contracts/CakeVault.sol";

import "./BunnyMintingStation.sol";
import "./PancakeProfile.sol";

/**
 * @title BunnySpecialCakeVault.
 * @notice It is a contract for users to mint Cake Vault collectible.
 */
contract BunnySpecialCakeVault is Ownable {
    using SafeMath for uint256;

    BunnyMintingStation public bunnyMintingStation;
    CakeVault public cakeVault;
    PancakeProfile public pancakeProfile;

    uint8 public constant bunnyId = 16;

    // Collectible-related.
    uint256 public endBlock;
    uint256 public thresholdTimestamp;

    // PancakeSwap Profile related.
    uint256 public numberPoints;
    uint256 public campaignId;

    string public tokenURI;

    // Map if address has already claimed a NFT
    mapping(address => bool) public hasClaimed;

    event BunnyMint(address indexed to, uint256 indexed tokenId, uint8 indexed bunnyId);
    event NewCampaignId(uint256 campaignId);
    event NewEndBlock(uint256 endBlock);
    event NewNumberPoints(uint256 numberPoints);
    event NewThresholdTimestamp(uint256 thresholdTimestamp);

    constructor(
        address _cakeVault,
        address _bunnyMintingStation,
        address _pancakeProfile,
        uint256 _endBlock,
        uint256 _thresholdTimestamp,
        uint256 _numberPoints,
        uint256 _campaignId,
        string memory _tokenURI
    ) public {
        cakeVault = CakeVault(_cakeVault);
        bunnyMintingStation = BunnyMintingStation(_bunnyMintingStation);
        pancakeProfile = PancakeProfile(_pancakeProfile);
        endBlock = _endBlock;
        thresholdTimestamp = _thresholdTimestamp;
        numberPoints = _numberPoints;
        campaignId = _campaignId;
        tokenURI = _tokenURI;
    }

    /**
     * @notice Mint a NFT from the BunnyMintingStation contract.
     * @dev Users can claim once.
     */
    function mintNFT() external {
        require(block.number < endBlock, "TOO_LATE");

        // Check msg.sender has not claimed
        require(!hasClaimed[msg.sender], "ERR_HAS_CLAIMED");

        bool isUserActive;
        (, , , , , isUserActive) = pancakeProfile.getUserProfile(msg.sender);

        require(isUserActive, "ERR_USER_NOT_ACTIVE");

        bool isUserEligible;
        isUserEligible = _canClaim(msg.sender);

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
     * @notice Change threshold timestamp for distribution
     * @dev Only callable by owner.
     */
    function changeThresholdTimestamp(uint256 _thresholdTimestamp) external onlyOwner {
        thresholdTimestamp = _thresholdTimestamp;

        emit NewThresholdTimestamp(_thresholdTimestamp);
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
                uint256 lastDepositedTime;
                (, lastDepositedTime, , ) = cakeVault.userInfo(_userAddress);

                if (lastDepositedTime != 0) {
                    if (lastDepositedTime < thresholdTimestamp) {
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
