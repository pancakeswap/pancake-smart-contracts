// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-0.8/access/Ownable.sol";

interface IGaugeVoting {
    function transferOwnership(address newOwner) external;

    function addGauge(
        address gauge_addr,
        uint256 gauge_type,
        uint256 _weight,
        uint256 _pid,
        address _masterChef,
        uint256 _chainId,
        uint256 _boostMultiplier,
        uint256 _maxVoteCap
    ) external;
}

contract GaugeVotingBulk is Ownable {
    struct GaugeConfig {
        address gauge_addr;
        uint256 gauge_type;
        uint256 _weight;
        uint256 _pid;
        address _masterChef;
        uint256 _chainId;
        uint256 _boostMultiplier;
        uint256 _maxVoteCap;
    }

    address public GaugeVoting = 0x14060b856c47983439509d17Ff8F4e11385cb1dd;

    function addGauges(GaugeConfig[] calldata _gaugeList) external onlyOwner {
        uint256 len = _gaugeList.length;
        for (uint256 i = 0; i < len; i++) {
            GaugeConfig memory g = _gaugeList[i];
            IGaugeVoting(GaugeVoting).addGauge(
                g.gauge_addr,
                g.gauge_type,
                g._weight,
                g._pid,
                g._masterChef,
                g._chainId,
                g._boostMultiplier,
                g._maxVoteCap
            );
        }
    }

    function transferBackOwner(address _owner) external onlyOwner {
        IGaugeVoting(GaugeVoting).transferOwnership(_owner);
    }
}
