// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

struct Point {
    int128 bias; // Voting weight
    int128 slope; // Multiplier factor to get voting weight at a given time
    uint256 timestamp;
    uint256 blockNumber;
}

interface IVCake {
    function deposit(
        address _user,
        uint256 _amount,
        uint256 _lockDuration
    ) external;

    function withdraw(address _user) external;

    /// @dev Return the max epoch of the given "_user"
    function userPointEpoch(address _user) external view returns (uint256);

    /// @dev Return the max global epoch
    function epoch() external view returns (uint256);

    /// @dev Return the recorded point for _user at specific _epoch
    function userPointHistory(address _user, uint256 _epoch) external view returns (Point memory);

    /// @dev Return the recorded global point at specific _epoch
    function pointHistory(uint256 _epoch) external view returns (Point memory);

    /// @dev Trigger global check point
    function checkpoint() external;
}
