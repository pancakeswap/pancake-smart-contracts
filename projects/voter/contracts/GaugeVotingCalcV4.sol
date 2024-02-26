// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

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

    function gaugeIndex_(bytes32 _hash) external view returns (uint256 gauge_idx);

    function getGaugeWeight(
        address gauge_addr,
        uint256 _chainId,
        bool inCap
    ) external view returns (uint256);
}

contract GaugeVotingCalcV4 {
    address public gaugeVotingAddress = 0xf81953dC234cdEf1D6D0d3ef61b232C6bCbF9aeF;

    function _getTotalGaugeWeight() internal view returns (uint256 gaugeTotalWeight) {
        // get total raw weights
        for (uint256 i = 0; i < IGaugeVoting(gaugeVotingAddress).gaugeCount(); i++) {
            // get total raw weights
            (, , uint256 chainId, address pairAddress, , ) = IGaugeVoting(gaugeVotingAddress).gauges(i);
            uint256 weight = IGaugeVoting(gaugeVotingAddress).getGaugeWeight(pairAddress, chainId, false);
            gaugeTotalWeight += weight;
        }
        return gaugeTotalWeight;
    }

    function getRawTotalGaugeWeight() external view returns (uint256 gaugeTotalWeight) {
        return _getTotalGaugeWeight();
    }

    function _getTotalCappedPercent(uint256 gaugeTotalWeight) internal view returns (uint256 gaugeTotalCappedPercent) {
        // get total capped percentages
        if (gaugeTotalWeight == 0) {
            gaugeTotalWeight = _getTotalGaugeWeight();
        }
        for (uint256 i = 0; i < IGaugeVoting(gaugeVotingAddress).gaugeCount(); i++) {
            // calc raw relative weights
            (, , uint256 chainId, address pairAddress, , uint256 maxVoteCap) = IGaugeVoting(gaugeVotingAddress).gauges(
                i
            );
            uint256 weight = IGaugeVoting(gaugeVotingAddress).getGaugeWeight(pairAddress, chainId, false);
            uint256 rawPercent = (weight * 10000000000) / gaugeTotalWeight;

            // check and get capped percent
            uint256 gaugeMaxPercent = maxVoteCap * 1000000;
            uint256 gaugeCappedPercent = rawPercent;
            if (rawPercent > gaugeMaxPercent && gaugeMaxPercent != 0) {
                gaugeCappedPercent = gaugeMaxPercent;
            }
            gaugeTotalCappedPercent += gaugeCappedPercent;
        }
        return gaugeTotalCappedPercent;
    }

    function getTotalCappedPercent() external view returns (uint256 gaugeTotalCappedPercent) {
        return _getTotalCappedPercent(0);
    }

    function _getTotalFinalWeights(uint256 gaugeTotalWeight, uint256 gaugeTotalCappedPercent)
        internal
        view
        returns (uint256 gaugeTotalFinalWeights)
    {
        // get total final adjusted vote weights
        if (gaugeTotalWeight == 0) {
            gaugeTotalWeight = _getTotalGaugeWeight();
        }
        if (gaugeTotalCappedPercent == 0) {
            gaugeTotalCappedPercent = _getTotalCappedPercent(0);
        }

        for (uint256 i = 0; i < IGaugeVoting(gaugeVotingAddress).gaugeCount(); i++) {
            // calc raw relative weights
            (, , uint256 chainId, address pairAddress, , uint256 maxVoteCap) = IGaugeVoting(gaugeVotingAddress).gauges(
                i
            );
            uint256 weight = IGaugeVoting(gaugeVotingAddress).getGaugeWeight(pairAddress, chainId, false);
            uint256 rawPercent = (weight * 10000000000) / gaugeTotalWeight;

            // check and get capped percent
            uint256 gaugeMaxPercent = maxVoteCap * 1000000;
            uint256 gaugeCappedPercent = rawPercent;
            if (rawPercent > gaugeMaxPercent && gaugeMaxPercent != 0) {
                gaugeCappedPercent = gaugeMaxPercent;
            }

            // get adjusted votes
            uint256 gaugeFinalWeight = (gaugeTotalWeight * gaugeCappedPercent) / 10000000000;
            if (rawPercent > gaugeMaxPercent && gaugeMaxPercent != 0) {
                gaugeFinalWeight = (gaugeFinalWeight * gaugeTotalCappedPercent) / 10000000000;
            }
            gaugeTotalFinalWeights += gaugeFinalWeight;
        }
        return gaugeTotalFinalWeights;
    }

    function getTotalFinalWeights() external view returns (uint256 gaugeTotalFinalWeights) {
        return _getTotalFinalWeights(0, 0);
    }

    function _getGaugeWeightDetails(
        uint256 _gaugeId,
        uint256 _gaugeTotalWeight,
        uint256 _gaugeTotalCappedPercent,
        uint256 _gaugeTotalFinalWeights
    )
        internal
        view
        returns (
            uint256 gaugeWeight,
            uint256 gaugeTotalWeight,
            uint256 gaugeRawPercent,
            uint256 gaugeCappedPercent,
            uint256 gaugeInCapWeight,
            uint256 gaugeTotalFinalWeights,
            uint256 gaugeFinalPercent
        )
    {
        (, , uint256 chainId, address pairAddress, , uint256 maxVoteCap) = IGaugeVoting(gaugeVotingAddress).gauges(
            _gaugeId
        );

        // indi
        gaugeWeight = IGaugeVoting(gaugeVotingAddress).getGaugeWeight(pairAddress, chainId, false);

        // get total raw weights
        if (_gaugeTotalWeight == 0) {
            gaugeTotalWeight = _getTotalGaugeWeight();
        } else {
            gaugeTotalWeight = _gaugeTotalWeight;
        }

        // indi
        gaugeRawPercent = (gaugeWeight * 10000000000) / gaugeTotalWeight;

        // get total capped percentages
        uint256 gaugeTotalCappedPercent;
        if (_gaugeTotalCappedPercent == 0) {
            gaugeTotalCappedPercent = _getTotalCappedPercent(0);
        } else {
            gaugeTotalCappedPercent = _gaugeTotalCappedPercent;
        }

        // get total final adjusted vote weights
        if (_gaugeTotalFinalWeights == 0) {
            gaugeTotalFinalWeights = gaugeTotalFinalWeights = _getTotalFinalWeights(
                gaugeTotalWeight,
                gaugeTotalCappedPercent
            );
        } else {
            gaugeTotalFinalWeights = _gaugeTotalFinalWeights;
        }

        uint256 gaugeMaxPercent = maxVoteCap * 1000000;
        gaugeCappedPercent = gaugeRawPercent;
        if (gaugeRawPercent > gaugeMaxPercent && gaugeMaxPercent != 0) {
            gaugeCappedPercent = gaugeMaxPercent;
        }
        // get adjusted votes
        gaugeInCapWeight = (gaugeTotalWeight * gaugeCappedPercent) / 10000000000;
        if (gaugeRawPercent > gaugeMaxPercent && gaugeMaxPercent != 0) {
            gaugeInCapWeight = (gaugeInCapWeight * gaugeTotalCappedPercent) / 10000000000;
        }

        gaugeFinalPercent = (gaugeInCapWeight * 10000000000) / gaugeTotalFinalWeights;

        return (
            gaugeWeight,
            gaugeTotalWeight,
            gaugeRawPercent,
            gaugeCappedPercent,
            gaugeInCapWeight,
            gaugeTotalFinalWeights,
            gaugeFinalPercent
        );
    }

    function getGaugeWeightDetails(uint256 _gaugeId)
        external
        view
        returns (
            uint256 gaugeWeight,
            uint256 gaugeTotalWeight,
            uint256 gaugeRawPercent,
            uint256 gaugeCappedPercent,
            uint256 gaugeInCapWeight,
            uint256 gaugeTotalFinalWeights,
            uint256 gaugeFinalPercent
        )
    {
        (
            gaugeWeight,
            gaugeTotalWeight,
            gaugeRawPercent,
            gaugeCappedPercent,
            gaugeInCapWeight,
            gaugeTotalFinalWeights,
            gaugeFinalPercent
        ) = _getGaugeWeightDetails(_gaugeId, 0, 0, 0);

        return (
            gaugeWeight,
            gaugeTotalWeight,
            gaugeRawPercent,
            gaugeCappedPercent,
            gaugeInCapWeight,
            gaugeTotalFinalWeights,
            gaugeFinalPercent
        );
    }

    function getGaugeWeight(
        address _gaugeAddr,
        uint256 _chainId,
        bool _inCap
    ) public view returns (uint256) {
        bytes32 gaugeHash = keccak256(abi.encodePacked(_gaugeAddr, _chainId));
        uint256 gaugeIdx = (IGaugeVoting(gaugeVotingAddress).gaugeIndex_(gaugeHash) - 1);
        (uint256 gaugeWeight, , , , uint256 gaugeInCapWeight, , ) = _getGaugeWeightDetails(gaugeIdx, 0, 0, 0);

        if (!_inCap) {
            return gaugeWeight;
        } else {
            return gaugeInCapWeight;
        }
    }

    function getGaugeWeightbyId(uint256 _gaugeId, bool _inCap) public view returns (uint256) {
        (uint256 gaugeWeight, , , , uint256 gaugeInCapWeight, , ) = _getGaugeWeightDetails(_gaugeId, 0, 0, 0);

        if (!_inCap) {
            return gaugeWeight;
        } else {
            return gaugeInCapWeight;
        }
    }

    function getTotalWeight(bool _inCap) public view returns (uint256) {
        if (!_inCap) {
            return _getTotalGaugeWeight();
        } else {
            return _getTotalFinalWeights(0, 0);
        }
    }

    function getGaugeRelativeWeight(
        address _gaugeAddr,
        uint256 _chainId,
        bool _inCap
    ) public view returns (uint256) {
        bytes32 gaugeHash = keccak256(abi.encodePacked(_gaugeAddr, _chainId));
        uint256 gaugeIdx = (IGaugeVoting(gaugeVotingAddress).gaugeIndex_(gaugeHash) - 1);
        (, , uint256 gaugeRawPercent, , , , uint256 gaugeFinalPercent) = _getGaugeWeightDetails(gaugeIdx, 0, 0, 0);

        if (!_inCap) {
            return gaugeRawPercent;
        } else {
            return gaugeFinalPercent;
        }
    }

    function getGaugeRelativeWeightById(uint256 _gaugeId, bool _inCap) public view returns (uint256) {
        (, , uint256 gaugeRawPercent, , , , uint256 gaugeFinalPercent) = _getGaugeWeightDetails(_gaugeId, 0, 0, 0);

        if (!_inCap) {
            return gaugeRawPercent;
        } else {
            return gaugeFinalPercent;
        }
    }

    function getGaugeWeightMass(
        address _gaugeAddr,
        uint256 _chainId,
        bool _inCap,
        uint256 _gaugeTotalWeight,
        uint256 _gaugeTotalCappedPercent,
        uint256 _gaugeTotalFinalWeights
    ) public view returns (uint256) {
        require(_gaugeTotalWeight * _gaugeTotalCappedPercent * _gaugeTotalFinalWeights > 0, "missing total params");

        bytes32 gaugeHash = keccak256(abi.encodePacked(_gaugeAddr, _chainId));
        uint256 gaugeIdx = (IGaugeVoting(gaugeVotingAddress).gaugeIndex_(gaugeHash) - 1);
        (uint256 gaugeWeight, , , , uint256 gaugeInCapWeight, , ) = _getGaugeWeightDetails(
            gaugeIdx,
            _gaugeTotalWeight,
            _gaugeTotalCappedPercent,
            _gaugeTotalFinalWeights
        );

        if (!_inCap) {
            return gaugeWeight;
        } else {
            return gaugeInCapWeight;
        }
    }

    function massGetGaugeWeight(bool _inCap) public view returns (uint256[] memory result) {
        // prep array
        uint256 gaugeCount = IGaugeVoting(gaugeVotingAddress).gaugeCount();
        result = new uint256[](gaugeCount);

        // get total raw weights
        uint256 gaugeTotalWeight = _getTotalGaugeWeight();

        // get total capped percentages
        uint256 gaugeTotalCappedPercent = _getTotalCappedPercent(gaugeTotalWeight);

        for (uint256 i = 0; i < gaugeCount; i++) {
            (, , uint256 chainId, address pairAddress, , uint256 maxVoteCap) = IGaugeVoting(gaugeVotingAddress).gauges(
                i
            );

            // indi
            uint256 gaugeWeight = IGaugeVoting(gaugeVotingAddress).getGaugeWeight(pairAddress, chainId, false);

            // indi
            uint256 gaugeRawPercent = (gaugeWeight * 10000000000) / gaugeTotalWeight;

            uint256 gaugeMaxPercent = maxVoteCap * 1000000;
            uint256 gaugeCappedPercent = gaugeRawPercent;
            if (gaugeRawPercent > gaugeMaxPercent && gaugeMaxPercent != 0) {
                gaugeCappedPercent = gaugeMaxPercent;
            }

            // get adjusted votes
            uint256 gaugeInCapWeight = (gaugeTotalWeight * gaugeCappedPercent) / 10000000000;
            if (gaugeRawPercent > gaugeMaxPercent && gaugeMaxPercent != 0) {
                gaugeInCapWeight = (gaugeInCapWeight * gaugeTotalCappedPercent) / 10000000000;
            }

            if (!_inCap) {
                result[i] = gaugeWeight;
            } else {
                result[i] = gaugeInCapWeight;
            }
        }
        return result;
    }
}
