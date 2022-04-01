// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IPancakeProfile
 */
interface IPancakeProfile {
    function createProfile(
        uint256 _teamId,
        address _nftAddress,
        uint256 _tokenId
    ) external;

    function pauseProfile() external;

    function updateProfile(address _nftAddress, uint256 _tokenId) external;

    function reactivateProfile(address _nftAddress, uint256 _tokenId) external;

    function increaseUserPoints(
        address _userAddress,
        uint256 _numberPoints,
        uint256 _campaignId
    ) external;

    function increaseUserPointsMultiple(
        address[] calldata _userAddresses,
        uint256 _numberPoints,
        uint256 _campaignId
    ) external;

    function increaseTeamPoints(
        uint256 _teamId,
        uint256 _numberPoints,
        uint256 _campaignId
    ) external;

    function removeUserPoints(address _userAddress, uint256 _numberPoints) external;

    function removeUserPointsMultiple(address[] calldata _userAddresses, uint256 _numberPoints) external;

    function removeTeamPoints(uint256 _teamId, uint256 _numberPoints) external;

    function addNftAddress(address _nftAddress) external;

    function addTeam(string calldata _teamName, string calldata _teamDescription) external;

    function changeTeam(address _userAddress, uint256 _newTeamId) external;

    function claimFee(uint256 _amount) external;

    function makeTeamJoinable(uint256 _teamId) external;

    function makeTeamNotJoinable(uint256 _teamId) external;

    function renameTeam(
        uint256 _teamId,
        string calldata _teamName,
        string calldata _teamDescription
    ) external;

    function updateNumberCake(
        uint256 _newNumberCakeToReactivate,
        uint256 _newNumberCakeToRegister,
        uint256 _newNumberCakeToUpdate
    ) external;

    function getUserProfile(address _userAddress)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            address,
            uint256,
            bool
        );

    function getUserStatus(address _userAddress) external view returns (bool);

    function getTeamProfile(uint256 _teamId)
        external
        view
        returns (
            string memory,
            string memory,
            uint256,
            uint256,
            bool
        );
}
