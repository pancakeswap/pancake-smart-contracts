// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin-4.5.0/contracts/access/Ownable.sol";
import "./RevenueSharingPool.sol";

contract RevenueSharingPoolFactory is Ownable {
    struct Parameters {
        address VECake;
        uint256 startTime;
        address rewardToken;
        address emergencyReturn;
        address owner;
    }

    Parameters public parameters;

    address public VECake;

    uint256 public poolLength;

    mapping(uint256 => address) public pools;

    uint256 public constant MAX_STARTTIME_DURATION = 4 weeks;

    event NewRevenueSharingPool(
        address indexed pool,
        address indexed rewardToken,
        uint256 startTime,
        uint256 poolsIndex
    );

    constructor(address _VECake) {
        VECake = _VECake;
    }

    /// @dev Deploys a RevenueSharingPool
    /// @param _startTime Time to be started
    /// @param _rewardToken The token to be distributed
    /// @param _emergencyReturn The address to return token when emergency stop
    function deploy(
        uint256 _startTime,
        address _rewardToken,
        address _emergencyReturn
    ) external onlyOwner returns (address pool) {
        require(_startTime <= block.timestamp + MAX_STARTTIME_DURATION, "Invalid startTime");
        parameters = Parameters({
            VECake: VECake,
            startTime: _startTime,
            rewardToken: _rewardToken,
            emergencyReturn: _emergencyReturn,
            owner: msg.sender
        });

        pool = address(
            new RevenueSharingPool{
                salt: keccak256(abi.encode(_rewardToken, _emergencyReturn, _startTime, block.timestamp))
            }()
        );

        delete parameters;

        poolLength++;
        pools[poolLength] = pool;

        emit NewRevenueSharingPool(pool, _rewardToken, _startTime, poolLength);
    }
}
