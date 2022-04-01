// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./utils/IFO.sol";
import "./interfaces/IPancakeProfile.sol";

/** @title PointCenterIFO.
 * @notice It is a contract for users to collect points
 * for IFOs they participated in.
 */
contract PointCenterIFO is Ownable {
    IPancakeProfile pancakeProfile;

    uint256 public maxViewLength;

    mapping(address => IFOs) public ifos;
    mapping(address => mapping(address => bool)) private _users;

    event IFOAdd(
        address indexed contractAddress,
        uint256 thresholdToClaim,
        uint256 indexed campaignId,
        uint256 numberPoints
    );

    struct IFOs {
        uint256 thresholdToClaim;
        uint256 campaignId;
        uint256 numberPoints;
    }

    constructor(address _pancakeProfileAddress, uint256 _maxViewLength) public {
        pancakeProfile = IPancakeProfile(_pancakeProfileAddress);
        maxViewLength = _maxViewLength;
    }

    function getPoints(address _contractAddress) external {
        address senderAddress = _msgSender();

        // 1. Check if IFO is valid
        require((ifos[_contractAddress].campaignId > 0) && (ifos[_contractAddress].numberPoints > 0), "not valid");

        // 2. Check if he has claimed
        require(!_users[senderAddress][_contractAddress], "has claimed for this IFO");

        // 3. Check if he is active
        bool isUserActive = pancakeProfile.getUserStatus(senderAddress);
        require(isUserActive, "not active");

        // 4. Check if he can claim
        IFO currentIfo = IFO(_contractAddress);

        uint256 amountUser;
        bool hasUserClaimed;

        // Read user info
        (amountUser, hasUserClaimed) = currentIfo.userInfo(senderAddress);

        require(hasUserClaimed, "has not claimed");
        require(amountUser > ifos[_contractAddress].thresholdToClaim, "too small");

        // 5. Update the status
        _users[senderAddress][_contractAddress] = true;

        // 6. Increase user points of sender
        pancakeProfile.increaseUserPoints(
            senderAddress,
            ifos[_contractAddress].numberPoints,
            ifos[_contractAddress].campaignId
        );
    }

    function addIFOAddress(
        address _contractAddress,
        uint256 _thresholdToClaim,
        uint256 _campaignId,
        uint256 _numberPoints
    ) external onlyOwner {
        // Add data to the struct for ifos
        ifos[_contractAddress] = IFOs({
            thresholdToClaim: _thresholdToClaim,
            campaignId: _campaignId,
            numberPoints: _numberPoints
        });

        emit IFOAdd(_contractAddress, _thresholdToClaim, _campaignId, _numberPoints);
    }

    function updateMaxViewLength(uint256 _newMaxViewLength) external onlyOwner {
        maxViewLength = _newMaxViewLength;
    }

    function checkClaimStatus(address _userAddress, address _contractAddress) external view returns (bool) {
        bool status = _checkClaimStatus(_userAddress, _contractAddress);
        return status;
    }

    function checkClaimStatuses(address _userAddress, address[] memory _contractAddresses)
        external
        view
        returns (bool[] memory)
    {
        bool[] memory responses = new bool[](_contractAddresses.length);

        require(_contractAddresses.length <= maxViewLength, "Length must be <= maxViewLength");

        for (uint256 i = 0; i < _contractAddresses.length; i++) {
            bool status = _checkClaimStatus(_userAddress, _contractAddresses[i]);
            responses[i] = status;
        }

        return responses;
    }

    function _checkClaimStatus(address _userAddress, address _contractAddress) private view returns (bool) {
        IFO currentIfo = IFO(_contractAddress);

        uint256 amountUser;
        bool hasUserClaimed;

        // read user info
        (amountUser, hasUserClaimed) = currentIfo.userInfo(_userAddress);

        if ((!hasUserClaimed) || (amountUser < ifos[_contractAddress].thresholdToClaim)) {
            // 1. Check if user has claimed funds from IFO AND match threshold
            return false;
        } else if (_users[_userAddress][_contractAddress]) {
            // 2. Check if user has already claimed points for this IFO
            return false;
        } else if (
            // 3. Check if a campaignId AND numberPoints were set
            (ifos[_contractAddress].campaignId < 1) || (ifos[_contractAddress].numberPoints < 1)
        ) {
            return false;
        } else {
            // 4. Can claim
            return true;
        }
    }
}
