// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin-4.5.0/contracts/access/Ownable.sol";
import "@openzeppelin-4.5.0/contracts/security/Pausable.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "../interfaces/IRevenueSharingPool.sol";

/**
 * @dev RevenueSharingPoolKeeper was designed to execute checkpointToken.
 */
contract RevenueSharingPoolKeeper is KeeperCompatibleInterface, Ownable, Pausable {
    address public register;
    IRevenueSharingPool public immutable RevenueSharingPool;

    uint256 public constant WEEK = 1 weeks;

    mapping(uint256 => bool) public checkpointTokenFlag;

    event NewRegister(address indexed register);

    /// @notice constructor.
    /// @param _RevenueSharingPool RevenueSharingPool address.
    constructor(IRevenueSharingPool _RevenueSharingPool) {
        RevenueSharingPool = _RevenueSharingPool;
    }

    modifier onlyRegister() {
        require(msg.sender == register, "Not register");
        _;
    }

    /// @notice Round off random timestamp to week
    /// @param _timestamp The timestamp to be rounded off
    function _timestampToFloorWeek(uint256 _timestamp) internal pure returns (uint256) {
        return (_timestamp / WEEK) * WEEK;
    }

    //The logic is consistent with the following performUpkeep function, in order to make the code logic clearer.
    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory) {
        if (!paused()) {
            uint256 lastTokenTimestamp = RevenueSharingPool.lastTokenTimestamp();
            uint256 weekCursor = _timestampToFloorWeek(block.timestamp);
            if (lastTokenTimestamp < weekCursor && !checkpointTokenFlag[weekCursor]) {
                upkeepNeeded = true;
            }
        }
    }

    function performUpkeep(bytes calldata) external override onlyRegister whenNotPaused {
        uint256 lastTokenTimestamp = RevenueSharingPool.lastTokenTimestamp();
        uint256 weekCursor = _timestampToFloorWeek(block.timestamp);
        if (lastTokenTimestamp < weekCursor && !checkpointTokenFlag[weekCursor]) {
            checkpointTokenFlag[weekCursor] = true;
            RevenueSharingPool.checkpointToken();
            RevenueSharingPool.checkpointTotalSupply();
        }
    }

    /// @notice Set register.
    /// @dev Callable by owner
    /// @param _register New register.
    function setRegister(address _register) external onlyOwner {
        require(_register != address(0), "Can not be zero address");
        register = _register;
        emit NewRegister(_register);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
