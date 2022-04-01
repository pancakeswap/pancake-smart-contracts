// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PancakeProfile} from "./PancakeProfile.sol";

/**
 * @title AnniversaryAchievement.
 * @notice It is a contract to distribute points for 1st anniversary.
 */
contract AnniversaryAchievement is Ownable {
    PancakeProfile public pancakeProfile;

    uint256 public campaignId;
    uint256 public numberPoints;
    uint256 public thresholdPoints;
    uint256 public endBlock;

    // Map if address has already claimed a NFT
    mapping(address => bool) public hasClaimed;

    event NewCampaignId(uint256 campaignId);
    event NewEndBlock(uint256 endBlock);
    event NewNumberPointsAndThreshold(uint256 numberPoints, uint256 thresholdPoints);

    /**
     * @notice Constructor
     * @param _pancakeProfile: Pancake Profile
     * @param _numberPoints: number of points to give
     * @param _thresholdPoints: number of points required to claim
     * @param _campaignId: campaign id
     * @param _endBlock: end block for claiming
     */
    constructor(
        address _pancakeProfile,
        uint256 _numberPoints,
        uint256 _thresholdPoints,
        uint256 _campaignId,
        uint256 _endBlock
    ) public {
        pancakeProfile = PancakeProfile(_pancakeProfile);
        numberPoints = _numberPoints;
        thresholdPoints = _thresholdPoints;
        campaignId = _campaignId;
        endBlock = _endBlock;
    }

    /**
     * @notice Get anniversary points
     * @dev Users can claim these once.
     */
    function claimAnniversaryPoints() external {
        require(canClaim(msg.sender), "Claim: Cannot claim");

        hasClaimed[msg.sender] = true;

        pancakeProfile.increaseUserPoints(msg.sender, numberPoints, campaignId);
    }

    /**
     * @notice Change campaignId
     * @dev Only callable by owner.
     * @param _campaignId: campaign id
     */
    function changeCampaignId(uint256 _campaignId) external onlyOwner {
        campaignId = _campaignId;

        emit NewCampaignId(_campaignId);
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
     * @notice Change end block for distribution
     * @dev Only callable by owner.
     * @param _numberPoints: number of points to give
     * @param _thresholdPoints: number of points required to claim
     */
    function changeNumberPointsAndThreshold(uint256 _numberPoints, uint256 _thresholdPoints) external onlyOwner {
        numberPoints = _numberPoints;
        thresholdPoints = _thresholdPoints;

        emit NewNumberPointsAndThreshold(_numberPoints, _thresholdPoints);
    }

    /**
     * @notice Checks the claim status by user
     * @dev Only callable by owner.
     * @param _user: user address
     */
    function canClaim(address _user) public view returns (bool) {
        if (!pancakeProfile.getUserStatus(_user)) {
            return false;
        }

        (, uint256 numberUserPoints, , , , ) = pancakeProfile.getUserProfile(_user);

        return (!hasClaimed[_user]) && (block.number < endBlock) && (numberUserPoints >= thresholdPoints);
    }
}
