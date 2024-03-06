// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin-4.5.0/contracts/access/Ownable.sol";
import "./RevenueSharingPool.sol";

contract RevenueSharingPoolFactory is Ownable {
    struct Parameters {
        address VCake;
        uint256 startTime;
        address rewardToken;
        address emergencyReturn;
        address owner;
    }

    Parameters public parameters;

    address public VCake;

    uint256 public poolLength;

    mapping(uint256 => address) public pools;

    mapping(address => address) public rewardTokenPools;

    uint256 public constant MAX_STARTTIME_DURATION = 4 weeks;

    event NewRevenueSharingPool(address indexed pool, address indexed rewardToken, uint256 startTime);

    constructor(address _VCake) {
        VCake = _VCake;
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
        require(rewardTokenPools[_rewardToken] == address(0), "Already created pool");
        require(_startTime <= block.timestamp + MAX_STARTTIME_DURATION, "Invalid startTime");
        parameters = Parameters({
            VCake: VCake,
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

        pools[poolLength] = pool;
        poolLength++;
        rewardTokenPools[_rewardToken] = pool;

        emit NewRevenueSharingPool(pool, _rewardToken, _startTime);
    }
}
