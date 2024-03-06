// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IFarmBooster {
    function onCakePoolUpdate(
        address _user,
        uint256 _lockedAmount,
        uint256 _lockedDuration,
        uint256 _totalLockedAmount,
        uint256 _maxLockDuration
    ) external;

    function updatePoolBoostMultiplier(address _user, uint256 _pid) external;

    function setProxy(address _user, address _proxy) external;

    function isBoosterPool(address _user, uint256 _pid) external view returns (bool);

    function getUserMultiplier(uint256 _tokenId) external view returns (uint256);
}
