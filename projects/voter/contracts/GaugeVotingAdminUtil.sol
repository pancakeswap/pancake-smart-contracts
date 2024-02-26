// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-0.8/access/Ownable.sol";

interface IGaugeVoting {
    function gauges(uint256 _gaugeId)
        external
        view
        returns (
            uint256 pid,
            address masterChef,
            uint256 chainId,
            address pairAddress,
            uint256 boostMultiplier,
            uint256 maxVoteCap
        );

    function gaugeCount() external view returns (uint256 gauge_count);

    function checkpointGauge(address gauge_addr, uint256 _chainId) external;

    function gaugeIndex_(bytes32 _hash) external view returns (uint256 gauge_idx);

    function gaugeTypes_(bytes32 _hash) external view returns (uint256 gauge_type);
}

contract GaugeVotingAdminUtil is Ownable {
    address public gaugeVotingAddress;

    event GaugeVotingAddressUpdated(address indexed sender, address indexed gaugeVotingAddress);

    function updateGaugeVotingAddress(address _newAddress) external onlyOwner {
        require(_newAddress != address(0), "address should not be empty");
        gaugeVotingAddress = _newAddress;
        emit GaugeVotingAddressUpdated(msg.sender, _newAddress);
    }

    function checkPointGaugesBulk(uint256 _startGaugeId, uint256 _endGaugeId) external {
        if (_startGaugeId == 0 && _endGaugeId == 0) {
            _endGaugeId = IGaugeVoting(gaugeVotingAddress).gaugeCount() - 1;
        }

        for (uint256 i = _startGaugeId; i <= _endGaugeId; i++) {
            (, , uint256 chainId, address pairAddress, , ) = IGaugeVoting(gaugeVotingAddress).gauges(i);
            IGaugeVoting(gaugeVotingAddress).checkpointGauge(pairAddress, chainId);
        }
    }

    function getGaugeHashFromId(uint256 _gaugeId) external view returns (bytes32 hash) {
        (, , uint256 chainId, address pairAddress, , ) = IGaugeVoting(gaugeVotingAddress).gauges(_gaugeId);
        hash = keccak256(abi.encodePacked(pairAddress, chainId));
    }

    function getGaugeHashFromPairAndChain(address pairAddress, uint256 chainId) external view returns (bytes32 hash) {
        hash = keccak256(abi.encodePacked(pairAddress, chainId));
    }

    function getGaugeInfoFull(bytes32 _hash)
        external
        view
        returns (
            uint256 gaugeId,
            uint256 gaugeTypeId,
            uint256 pid,
            address masterChef,
            uint256 chainId,
            address pairAddress,
            uint256 boostMultiplier,
            uint256 maxVoteCap
        )
    {
        gaugeId = IGaugeVoting(gaugeVotingAddress).gaugeIndex_(_hash) - 1;
        gaugeTypeId = IGaugeVoting(gaugeVotingAddress).gaugeTypes_(_hash) - 1;
        (pid, masterChef, chainId, pairAddress, boostMultiplier, maxVoteCap) = IGaugeVoting(gaugeVotingAddress).gauges(
            gaugeId
        );
    }
}
