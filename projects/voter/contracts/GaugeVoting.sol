// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-0.8/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-0.8/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts-0.8/access/Ownable.sol";
import "@openzeppelin/contracts-0.8/security/Pausable.sol";

import "./libraries/SafeCast.sol";

interface VotingEscrow {
    function userInfo(address user)
        external
        view
        returns (
            address, // cakePoolProxy
            uint128, // cakeAmount
            uint48, // lockEndTime
            uint48, // migrationTime
            uint16, // cakePoolType
            uint16 // withdrawFlag
        );

    function locks(address addr) external view returns (int128, uint256);

    function totalSupplyAtTime(uint256 _timestamp) external view returns (uint256);
}

contract GaugeVoting is Ownable, Pausable {
    address public immutable votingEscrow; // Voting escrow

    /// @dev 7 * 86400 seconds - all future times are rounded by week
    uint256 constant WEEK = 604800;
    /// @dev Period for the maximum lock
    uint256 constant MAX_LOCK_TIME = 126403199;
    /// @dev Add 2 weeks time to calculate actual 2 weeks epoch
    uint256 constant TWOWEEK = WEEK * 2;
    /// @dev Cannot change weight votes more often than once in 10 days
    uint256 public WEIGHT_VOTE_DELAY;
    /// @dev Period for admin adjusting only
    uint256 public ADMIN_VOTE_PERIOD;

    struct GaugeInfo {
        uint256 pid;
        address masterChef;
        uint256 chainId;
        address pairAddress;
        uint256 boostMultiplier;
        uint256 maxVoteCap;
    }

    struct Point {
        uint256 bias;
        uint256 slope;
    }

    struct VotedSlope {
        uint256 slope;
        uint256 power;
        uint256 end;
    }

    uint256 constant MULTIPLIER = 10**18;

    uint256 constant BOOST_PRECISION = 100;
    uint256 constant CAP_PRECISION = 10000;

    /// @notice Gauge parameters
    /// @dev All numbers are "fixed point" on the bias of 1e18
    uint256 public gaugeTypes;
    uint256 public gaugeCount;
    mapping(uint256 => string) public gaugeTypeNames;

    /// @notice Needed for enumeration
    GaugeInfo[1000000000] public gauges;
    mapping(bytes32 => uint256) public gaugeIndex_;
    /// @dev we increment values by 1 prior to storing them here so we can rely on a value
    /// of zero as meaning the gauge has not been set
    mapping(bytes32 => uint256) public gaugeTypes_;
    /// @dev record gauge is available for voting or not
    mapping(bytes32 => bool) public gaugeIsKilled_;

    /// @dev user -> gauge_hash -> VotedSlope
    mapping(address => mapping(bytes32 => VotedSlope)) public voteUserSlopes;
    /// @dev Total vote power used by user
    mapping(address => uint256) public voteUserPower;
    /// @dev Last user vote's timestamp for each gauge hash
    mapping(address => mapping(bytes32 => uint256)) public lastUserVote;

    /// @dev Admin total slope time -> Point
    mapping(uint256 => uint256) public adminSlopes;

    /// @dev Admin vote total / division
    uint256 public adminAllocation;

    /// @notice Past and scheduled points for gauge weight, sum of weights per type, total weight
    /// Point is for bias+slope
    /// changes_* are for changes in slope
    /// time_* are for the last change timestamp
    /// timestamps are rounded to whole weeks

    /// @dev gauge_hash -> time -> Point
    mapping(bytes32 => mapping(uint256 => Point)) public gaugePointsWeight;
    /// @dev gauge_hash -> time -> slope
    mapping(bytes32 => mapping(uint256 => uint256)) public gaugeChangesWeight;
    /// @dev gauge_hash -> last scheduled time (next 2 weeks)
    mapping(bytes32 => uint256) public gaugeLastScheduled;

    /// @dev type_id -> time -> Point
    mapping(uint256 => mapping(uint256 => Point)) public gaugeTypePointsSum;
    /// @dev type_id -> time -> slope
    mapping(uint256 => mapping(uint256 => uint256)) public gaugeTypeChangesSum;
    /// @dev type_id -> last scheduled time (next 2 weeks)
    uint256[1000000000] public gaugeTypeSumLastScheduled;

    /// @dev time -> total weight
    mapping(uint256 => uint256) public gaugePointsTotal;
    /// @dev last scheduled time
    uint256 public totalLastScheduled;

    /// @dev type_id -> time -> type weight
    mapping(uint256 => mapping(uint256 => uint256)) public gaugeTypePointsWeight;
    /// @dev type_id -> last scheduled time (next 2 weeks)
    uint256[1000000000] public gaugeTypeLastScheduled;

    event AdminAllocationChanged(address indexed sender, uint256 allocation);
    event WeightVoteDelayChanged(address indexed sender, uint256 delay);
    event AddType(string name, uint256 type_id);
    event NewGauge(
        bytes32 hash,
        uint256 gauge_type,
        uint256 weight,
        uint256 pid,
        address masterChef,
        uint256 chainId,
        uint256 boostMultiplier,
        uint256 maxVoteCap
    );
    event UpdateGaugeInfo(
        bytes32 hash,
        uint256 pid,
        address masterChef,
        uint256 chainId,
        uint256 boostMultiplier,
        uint256 maxVoteCap
    );
    event NewTypeWeight(uint256 type_id, uint256 time, uint256 weight, uint256 total_weight);
    event NewGaugeWeight(bytes32 hash, uint256 time, uint256 weight, uint256 total_weight);
    event VoteForGauge(uint256 time, address user, bytes32 hash, uint256 weight);
    event VoteForGaugeFromAdmin(uint256 time, address user, bytes32 hash, uint256 weight);
    event GaugeKilled(address indexed sender, address indexed gauage_addr, uint256 chainId, bytes32 hash);
    event GaugeUnKilled(address indexed sender, address indexed gauage_addr, uint256 chainId, bytes32 hash);
    event AdminOnlyPeriodUpdated(address indexed sender, uint256 period);

    /// @notice Contract constructor
    /// @param _votingEscrow `VotingEscrow` contract address
    constructor(address _votingEscrow) {
        require(_votingEscrow != address(0), "Invalid voting escrow address");
        votingEscrow = _votingEscrow;
        totalLastScheduled = (block.timestamp / WEEK) * WEEK;

        adminAllocation = 20;

        WEIGHT_VOTE_DELAY = 10 * 86400;
        ADMIN_VOTE_PERIOD = 1 * 86400;
    }

    /// @notice Change admin allocation by total / division
    /// @param _numerator The numerator for calculate allocation of admin
    function changeAdminAllocation(uint256 _numerator) external onlyOwner {
        require(_numerator > 0 && _numerator <= 100, "division should not exceed 100");

        adminAllocation = _numerator;

        emit AdminAllocationChanged(msg.sender, _numerator);
    }

    /// @notice Change admin weight of user vote delay
    /// @param _delay New delay numer
    function changeWeightVoteDelay(uint256 _delay) external onlyOwner {
        require(_delay > WEEK, "delay should exceed WEEK");
        require(_delay < MAX_LOCK_TIME, "delay should not exceed MAX_LOCK_TIME");

        WEIGHT_VOTE_DELAY = _delay;

        emit WeightVoteDelayChanged(msg.sender, _delay);
    }

    /// @notice Add gauge type with name `_name` and weight `weight`
    /// @param _name Name of gauge type
    /// @param _weight Weight of gauge type
    function addType(string memory _name, uint256 _weight) external onlyOwner {
        uint256 typeId = gaugeTypes;
        gaugeTypeNames[typeId] = _name;
        gaugeTypes = typeId + 1;
        if (_weight != 0) {
            _changeTypeWeight(typeId, _weight);
        }

        emit AddType(_name, typeId);
    }

    /// @notice Change gauge type `type_id` weight to `weight`
    /// @param type_id Gauge type id
    /// @param weight New Gauge weight
    function changeTypeWeight(uint256 type_id, uint256 weight) external onlyOwner {
        _changeTypeWeight(type_id, weight);
    }

    /// @notice Add gauge `gauge_addr` of type `gauge_type` with weight `weight`
    /// @param gauge_addr Gauge address
    /// @param gauge_type Gauge type
    /// @param _weight Gauge weight
    /// @param _pid Their upper MasterChef
    /// @param _masterChef Their MasterChef address
    /// @param _chainId the gauge's chainId
    /// @param _boostMultiplier The boost for weight
    /// @param _maxVoteCap The cap for weight
    function addGauge(
        address gauge_addr,
        uint256 gauge_type,
        uint256 _weight,
        uint256 _pid,
        address _masterChef,
        uint256 _chainId,
        uint256 _boostMultiplier,
        uint256 _maxVoteCap
    ) external onlyOwner {
        require(gauge_type < gaugeTypes, "Invalid gauge type");
        bytes32 gauge_hash = keccak256(abi.encodePacked(gauge_addr, _chainId));
        require(gaugeTypes_[gauge_hash] == 0, "Gauge already added"); // dev: cannot add the same twice
        require(_masterChef != address(0), "masterChef address is empty");
        require(_boostMultiplier <= 500);
        require(_maxVoteCap <= 10000);

        uint256 n = gaugeCount;
        gaugeCount = n + 1;
        gauges[uint256(n)] = GaugeInfo({
            pairAddress: gauge_addr,
            pid: _pid,
            masterChef: _masterChef,
            chainId: _chainId,
            boostMultiplier: _boostMultiplier,
            maxVoteCap: _maxVoteCap
        });

        gaugeIndex_[gauge_hash] = n + 1;
        gaugeTypes_[gauge_hash] = gauge_type + 1;

        uint256 nextTime = _getNextTime();

        if (_weight > 0) {
            uint256 typeWeight = _getTypeWeight(gauge_type);
            uint256 oldTypeSum = _getTypeSum(gauge_type);
            uint256 oldTotal = _getTotal();

            gaugeTypePointsSum[gauge_type][nextTime].bias = (_weight * _boostMultiplier) / BOOST_PRECISION + oldTypeSum;
            gaugeTypeSumLastScheduled[gauge_type] = nextTime;
            gaugePointsTotal[nextTime] = oldTotal + (typeWeight * _weight * _boostMultiplier) / BOOST_PRECISION;
            totalLastScheduled = nextTime;

            gaugePointsWeight[gauge_hash][nextTime].bias = (_weight * _boostMultiplier) / BOOST_PRECISION;
        }

        if (gaugeTypeSumLastScheduled[gauge_type] == 0) {
            gaugeTypeSumLastScheduled[gauge_type] = nextTime;
        }
        gaugeLastScheduled[gauge_hash] = nextTime;

        emit NewGauge(gauge_hash, gauge_type, _weight, _pid, _masterChef, _chainId, _boostMultiplier, _maxVoteCap);
    }

    /// @notice Update info of gauge `gauge_addr` and `_chainId` to GaugeInfo
    /// @param gauge_addr `GaugeController` contract address
    /// @param _pid Their upper MasterChef
    /// @param _masterChef Their MasterChef address
    /// @param _chainId the gauge's chainId
    /// @param _boostMultiplier The boost for weight
    /// @param _maxVoteCap The cap for weight
    function updateGaugeInfo(
        address gauge_addr,
        uint256 _pid,
        address _masterChef,
        uint256 _chainId,
        uint256 _boostMultiplier,
        uint256 _maxVoteCap
    ) external onlyOwner {
        require(_masterChef != address(0), "masterChef address is empty");
        require(_boostMultiplier <= 500);
        require(_maxVoteCap <= 10000);

        bytes32 gauge_hash = keccak256(abi.encodePacked(gauge_addr, _chainId));
        uint256 idx = gaugeIndex_[gauge_hash];
        require(idx > 0, "Gauge not added");

        uint256 nextTime = _getNextTime();

        uint256 _weight = gaugePointsWeight[gauge_hash][nextTime].bias;
        uint256 _type = gaugeTypes_[gauge_hash] - 1;

        if (_weight > 0) {
            uint256 typeWeight = _getTypeWeight(_type);
            uint256 oldWeight = getGaugeWeight(gauge_addr, _chainId, false);
            uint256 oldTypeSum = _getTypeSum(_type);
            uint256 oldTotal = _getTotal();

            gaugeTypePointsSum[_type][nextTime].bias = oldTypeSum + _weight - oldWeight;
            gaugeTypeSumLastScheduled[_type] = nextTime;
            gaugePointsTotal[nextTime] = oldTotal + typeWeight * _weight - typeWeight * oldWeight;
            totalLastScheduled = nextTime;
        }

        if (gaugeTypeSumLastScheduled[_type] == 0) {
            gaugeTypeSumLastScheduled[_type] = nextTime;
        }

        gauges[idx - 1] = GaugeInfo({
            pairAddress: gauge_addr,
            pid: _pid,
            masterChef: _masterChef,
            chainId: _chainId,
            boostMultiplier: _boostMultiplier,
            maxVoteCap: _maxVoteCap
        });

        emit UpdateGaugeInfo(gauge_hash, _pid, _masterChef, _chainId, _boostMultiplier, _maxVoteCap);
    }

    /// @notice Change weight of gauge `gauge_addr` and `_chainId` to `weight`
    /// @param gauge_addr `GaugeController` contract address
    /// @param weight New Gauge weight
    /// @param _chainId the gauge's chainId
    function changeGaugeWeight(
        address gauge_addr,
        uint256 weight,
        uint256 _chainId
    ) external onlyOwner {
        _changeGaugeWeight(gauge_addr, weight, _chainId);
    }

    /// @notice Checkpoint to fill data common for all gauges
    function checkpoint() external {
        _getTotal();
    }

    /// @notice Checkpoint to fill data for both a specific gauge and common for all gauges
    /// @param gauge_addr Gauge address
    /// @param _chainId the gauge's chainId
    function checkpointGauge(address gauge_addr, uint256 _chainId) external {
        bytes32 gauge_hash = keccak256(abi.encodePacked(gauge_addr, _chainId));
        uint256 idx = gaugeIndex_[gauge_hash];
        require(idx > 0, "Gauge not added");

        _getWeight(gauge_hash);
        _getTotal();
    }

    /// @notice Get Gauge relative weight (not more than 1.0) normalized to 1e18
    /// (e.g. 1.0 == 1e18). Inflation which will be received by it is
    /// inflation_rate * inflation_weight / 1e18
    /// @param gauge_addr Gauge address
    /// @param time Relative weight at the specified timestamp in the past or present
    /// @param _chainId the gauge's chainId
    /// @return Value of relative weight normalized to 1e18
    function gaugeRelativeWeight(
        address gauge_addr,
        uint256 time,
        uint256 _chainId
    ) external view returns (uint256) {
        return _gaugeRelativeWeight(gauge_addr, time, _chainId);
    }

    /// @notice Get gauge weight normalized to 1e18 and also fill all the unfilled
    /// values for type and gauge records
    /// @dev Any address can call, however nothing is recorded if the values are filled already
    /// @param gauge_addr Gauge address
    /// @param time Relative weight at the specified timestamp in the past or present
    /// @param _chainId the gauge's chainId
    /// @return Value of relative weight normalized to 1e18
    function gaugeRelativeWeight_write(
        address gauge_addr,
        uint256 time,
        uint256 _chainId
    ) external returns (uint256) {
        bytes32 gauge_hash = keccak256(abi.encodePacked(gauge_addr, _chainId));
        uint256 idx = gaugeIndex_[gauge_hash];
        require(idx > 0, "Gauge not added");

        _getWeight(gauge_hash);
        _getTotal(); // Also calculates get_sum

        return _gaugeRelativeWeight(gauge_addr, time, _chainId);
    }

    function voteForGaugeWeightsBulk(
        address[] calldata _gauge_addrs,
        uint256[] calldata _user_weights,
        uint256[] calldata _chainIds,
        bool _skipNative,
        bool _skipProxy
    ) external {
        uint256 len = _gauge_addrs.length;
        require(len == _user_weights.length, "length is not same");
        require(len == _chainIds.length, "length is not same");

        for (uint256 i = 0; i < len; i++) {
            voteForGaugeWeights(_gauge_addrs[i], _user_weights[i], _chainIds[i], _skipNative, _skipProxy);
        }
    }

    /// @notice Allocate voting power for changing pool weights
    /// @param _gauge_addr Gauge which `msg.sender` votes for
    /// @param _user_weight Weight for a gauge in bps (uints of 0.01%). Minimal is 0.01%. Ignored if 0
    /// @param _chainId the gauge's chainId
    /// @param _skipNative flag if we skip to check EOA address
    /// @param _skipProxy flag if we skip to check proxy address
    function voteForGaugeWeights(
        address _gauge_addr,
        uint256 _user_weight,
        uint256 _chainId,
        bool _skipNative,
        bool _skipProxy
    ) public {
        // get the "actual" next time (next voting end time) which should be even weeks Thursday
        uint256 actualNextTime = ((block.timestamp + TWOWEEK) / TWOWEEK) * TWOWEEK;

        // block user voting if it is within ADMIN_VOTE_PERIOD before actual next time
        require(block.timestamp < actualNextTime - ADMIN_VOTE_PERIOD, "Currently in admin only period");

        bytes32 gauge_hash = keccak256(abi.encodePacked(_gauge_addr, _chainId));

        uint256 powerUsed = voteUserPower[msg.sender];

        if (gaugeIsKilled_[gauge_hash] && powerUsed >= 10000) {
            _user_weight = 0;
        }

        require(!gaugeIsKilled_[gauge_hash] || _user_weight == 0, "gauge killed");

        require(_user_weight <= 10000, "You used all your voting power");

        address escrow = votingEscrow;

        uint256 nextTime = _getNextTime();

        if (!_skipNative) {
            (int128 amount, uint256 lockEnd) = VotingEscrow(escrow).locks(msg.sender);
            uint256 slopeUint256 = SafeCast.toUint256(amount) / MAX_LOCK_TIME;
            if (
                slopeUint256 > 0 &&
                lockEnd > nextTime &&
                block.timestamp >= lastUserVote[msg.sender][gauge_hash] + WEIGHT_VOTE_DELAY
            ) {
                _voteFromUser(gauge_hash, msg.sender, _user_weight, slopeUint256, lockEnd);
            }
        }

        (address cakePoolProxy, , , , , ) = VotingEscrow(escrow).userInfo(msg.sender);

        if (!_skipProxy && cakePoolProxy != address(0)) {
            (int128 amount1, uint256 lockEnd1) = VotingEscrow(escrow).locks(cakePoolProxy);
            uint256 slope1Uint256 = SafeCast.toUint256(amount1) / MAX_LOCK_TIME;
            if (
                slope1Uint256 > 0 &&
                lockEnd1 > nextTime &&
                block.timestamp >= lastUserVote[cakePoolProxy][gauge_hash] + WEIGHT_VOTE_DELAY
            ) {
                _voteFromUser(gauge_hash, cakePoolProxy, _user_weight, slope1Uint256, lockEnd1);
            }
        }
    }

    function voteFromAdminBulk(
        address[] calldata _gauge_addrs,
        uint256[] calldata _admin_weights,
        uint256[] calldata _ends,
        uint256[] calldata _chainIds
    ) external onlyOwner {
        uint256 len = _gauge_addrs.length;
        require(len == _admin_weights.length, "length is not same");
        require(len == _ends.length, "length is not same");
        require(len == _chainIds.length, "length is not same");

        for (uint256 i = 0; i < len; i++) {
            _voteFromAdmin(_gauge_addrs[i], _admin_weights[i], _ends[i], _chainIds[i]);
        }
    }

    /// @notice Vote from admin for changing pool weights
    /// @param _gauge_addr Gauge which `msg.sender` votes for
    /// @param _admin_weight Weight for a gauge in bps (uints of 0.01%). Minimal is 0.01%. Ignored if 0
    /// @param _end the timestamp that admin vote effect ends
    /// @param _chainId the gauge's chainId
    function voteFromAdmin(
        address _gauge_addr,
        uint256 _admin_weight,
        uint256 _end,
        uint256 _chainId
    ) external onlyOwner {
        _voteFromAdmin(_gauge_addr, _admin_weight, _end, _chainId);
    }

    /// @notice Get current gauge weight
    /// @param gauge_addr Gauge address
    /// @param _chainId the gauge's chainId
    /// @return Gauge weight
    function getGaugeWeight(
        address gauge_addr,
        uint256 _chainId,
        bool inCap
    ) public view returns (uint256) {
        bytes32 gauge_hash = keccak256(abi.encodePacked(gauge_addr, _chainId));
        uint256 idx = gaugeIndex_[gauge_hash];
        require(idx > 0, "Gauge not added");
        GaugeInfo memory info = gauges[idx - 1];

        uint256 bias = gaugePointsWeight[gauge_hash][gaugeLastScheduled[gauge_hash]].bias;

        if (inCap) {
            if (info.maxVoteCap >= 100 && bias > 0) {
                uint256 totalBias = 0;
                for (uint256 i = 0; i < gaugeCount; i++) {
                    GaugeInfo memory info1 = gauges[i];
                    bytes32 gauge_hash1 = keccak256(abi.encodePacked(info1.pairAddress, info1.chainId));
                    uint256 rate1 = (gaugePointsWeight[gauge_hash1][gaugeLastScheduled[gauge_hash1]].bias *
                        BOOST_PRECISION *
                        CAP_PRECISION) / gaugePointsTotal[totalLastScheduled];

                    if (info1.maxVoteCap > 0 && rate1 > info1.maxVoteCap) {
                        rate1 = info1.maxVoteCap * BOOST_PRECISION;
                    }

                    totalBias = totalBias + rate1;
                }

                bias =
                    (info.maxVoteCap * totalBias * gaugePointsTotal[totalLastScheduled]) /
                    BOOST_PRECISION /
                    BOOST_PRECISION /
                    CAP_PRECISION;
            }
        }

        return bias;
    }

    /// @notice Get current type and chainId weight
    /// @param _typeId Type id
    /// @param _chainId the gauge's chainId
    /// @return Type weight
    function getTypeAndChainIdWeightCapped(uint256 _typeId, uint256 _chainId) external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < gaugeCount; i++) {
            GaugeInfo memory info1 = gauges[i];
            bytes32 gauge_hash1 = keccak256(abi.encodePacked(info1.pairAddress, info1.chainId));
            uint256 type1 = gaugeTypes_[gauge_hash1] - 1;
            if (type1 == _typeId && info1.chainId == _chainId) {
                uint256 weight = getGaugeWeight(info1.pairAddress, info1.chainId, true);
                total += weight;
            }
        }
        return total;
    }

    /// @notice Get current total (type-weighted) weight
    /// @return Total weight
    function getTotalWeight(bool inCap) public view returns (uint256) {
        if (inCap) {
            uint256 total = 0;
            for (uint256 i = 0; i < gaugeCount; i++) {
                GaugeInfo memory info1 = gauges[i];
                uint256 weight = getGaugeWeight(info1.pairAddress, info1.chainId, true);
                total += weight;
            }

            return total;
        }
        return gaugePointsTotal[totalLastScheduled];
    }

    /// @notice Get sum of gauge weights per type
    /// @param _typeId Type id
    /// @return Sum of gauge weights
    function getWeightsSumPerType(uint256 _typeId) external view returns (uint256) {
        return gaugeTypePointsSum[_typeId][gaugeTypeSumLastScheduled[_typeId]].bias;
    }

    /// @notice Kill a gauge for disable user voting
    /// @param _gauge_addr Gauge address
    /// @param _chainId the gauge's chainId
    function killGauge(address _gauge_addr, uint256 _chainId) external onlyOwner {
        bytes32 gauge_hash = keccak256(abi.encodePacked(_gauge_addr, _chainId));
        gaugeIsKilled_[gauge_hash] = true;
        emit GaugeKilled(msg.sender, _gauge_addr, _chainId, gauge_hash);
    }

    /// @notice UnKill a gauge for enable user voting
    /// @param _gauge_addr Gauge address
    /// @param _chainId the gauge's chainId
    function unkillGauge(address _gauge_addr, uint256 _chainId) external onlyOwner {
        bytes32 gauge_hash = keccak256(abi.encodePacked(_gauge_addr, _chainId));
        gaugeIsKilled_[gauge_hash] = false;
        emit GaugeUnKilled(msg.sender, _gauge_addr, _chainId, gauge_hash);
    }

    function updateAdminOnlyPeriod(uint256 _newAdminOnlyPeriod) external onlyOwner {
        // avoid setting this to too long
        require(_newAdminOnlyPeriod < WEEK, "admin period too long");

        ADMIN_VOTE_PERIOD = _newAdminOnlyPeriod;

        emit AdminOnlyPeriodUpdated(msg.sender, _newAdminOnlyPeriod);
    }

    //////////////////// INSIDE FUNCTIONS //////////////////////////////

    function _getNextTime() internal view returns (uint256 nextTime) {
        nextTime = ((block.timestamp + WEEK) / WEEK) * WEEK;
    }

    /// @notice Change type weight
    /// @param _typeId Type id
    /// @param _weight New type weight
    function _changeTypeWeight(uint256 _typeId, uint256 _weight) internal {
        require(_typeId < gaugeTypes, "Invalid gauge type");
        uint256 oldTypeWeight = _getTypeWeight(_typeId);
        uint256 oldSum = _getTypeSum(_typeId);
        uint256 totalWeight = _getTotal();
        uint256 nextTime = _getNextTime();

        totalWeight = totalWeight + oldSum * _weight - oldSum * oldTypeWeight;
        gaugePointsTotal[nextTime] = totalWeight;
        gaugeTypePointsWeight[_typeId][nextTime] = _weight;
        totalLastScheduled = nextTime;
        gaugeTypeLastScheduled[_typeId] = nextTime;

        emit NewTypeWeight(_typeId, nextTime, _weight, totalWeight);
    }

    /// @notice Change gauge weight
    /// @dev Only need when testing in reality
    function _changeGaugeWeight(
        address gauge_addr,
        uint256 _weight,
        uint256 _chainId
    ) internal {
        bytes32 gauge_hash = keccak256(abi.encodePacked(gauge_addr, _chainId));
        uint256 gauge_type = gaugeTypes_[gauge_hash] - 1;

        uint256 idx = gaugeIndex_[gauge_hash];
        require(idx > 0, "Gauge not added");

        GaugeInfo memory info = gauges[idx - 1];

        uint256 oldGaugeWeight = _getWeight(gauge_hash);
        uint256 typeWeight = _getTypeWeight(gauge_type);
        uint256 oldSum = _getTypeSum(gauge_type);
        uint256 totalWeight = _getTotal();
        uint256 nextTime = _getNextTime();

        gaugePointsWeight[gauge_hash][nextTime].bias = (_weight * info.boostMultiplier) / BOOST_PRECISION;
        gaugeLastScheduled[gauge_hash] = nextTime;

        uint256 newSum = oldSum + (_weight * info.boostMultiplier) / BOOST_PRECISION - oldGaugeWeight;
        gaugeTypePointsSum[gauge_type][nextTime].bias = newSum;
        gaugeTypeSumLastScheduled[gauge_type] = nextTime;

        totalWeight = totalWeight + newSum * typeWeight - oldSum * typeWeight;
        gaugePointsTotal[nextTime] = totalWeight;
        totalLastScheduled = nextTime;

        emit NewGaugeWeight(gauge_hash, block.timestamp, _weight, totalWeight);
    }

    /// @notice Fill historic type weights week-over-week for missed checkins
    /// and return the type weight for the future week
    /// @param _type Gauge type id
    /// @return Type weight
    function _getTypeWeight(uint256 _type) internal returns (uint256) {
        uint256 t = gaugeTypeLastScheduled[_type];
        if (t > 0) {
            uint256 weight = gaugeTypePointsWeight[_type][t];
            for (uint256 i = 0; i < 500; i++) {
                if (t > block.timestamp) {
                    break;
                }
                t += WEEK;
                gaugeTypePointsWeight[_type][t] = weight;
                if (t > block.timestamp) {
                    gaugeTypeLastScheduled[_type] = t;
                }
            }
            return weight;
        } else {
            return 0;
        }
    }

    /// @notice Fill historic gauge weights week-over-week for missed checkins
    /// and return the total for the future week
    /// @param gauge_hash bytes32 of the gauge address and chainId
    /// @return Gauge weight
    function _getWeight(bytes32 gauge_hash) internal returns (uint256) {
        uint256 t = gaugeLastScheduled[gauge_hash];
        if (t > 0) {
            Point memory pt = gaugePointsWeight[gauge_hash][t];
            for (uint256 i = 0; i < 500; i++) {
                if (t > block.timestamp) {
                    break;
                }
                t += WEEK;
                uint256 d_bias = pt.slope * WEEK;
                if (pt.bias > d_bias) {
                    pt.bias -= d_bias;
                    uint256 d_slope = gaugeChangesWeight[gauge_hash][t];
                    pt.slope -= d_slope;
                } else {
                    pt.bias = 0;
                    pt.slope = 0;
                }
                gaugePointsWeight[gauge_hash][t] = pt;
                if (t > block.timestamp) {
                    gaugeLastScheduled[gauge_hash] = t;
                }
            }
            return pt.bias;
        } else {
            return 0;
        }
    }

    /// @notice Fill sum of gauge weights for the same type week-over-week for
    /// missed checkins and return the sum for the future week
    /// @param _type Gauge type id
    /// @return Sum of weights
    function _getTypeSum(uint256 _type) internal returns (uint256) {
        uint256 t = gaugeTypeSumLastScheduled[_type];
        if (t > 0) {
            Point memory pt = gaugeTypePointsSum[_type][t];
            for (uint256 i = 0; i < 500; i++) {
                if (t > block.timestamp) {
                    break;
                }
                t += WEEK;
                uint256 d_bias = pt.slope * WEEK;
                if (pt.bias > d_bias) {
                    pt.bias -= d_bias;
                    uint256 d_slope = gaugeTypeChangesSum[_type][t];
                    pt.slope -= d_slope;
                } else {
                    pt.bias = 0;
                    pt.slope = 0;
                }
                gaugeTypePointsSum[_type][t] = pt;

                if (t > block.timestamp) {
                    gaugeTypeSumLastScheduled[_type] = t;
                }
            }
            return pt.bias;
        } else {
            return 0;
        }
    }

    /// @notice Fill historic total weights week-over-week for missed checkins
    /// and return the total for the future week
    /// @return Total weight
    function _getTotal() internal returns (uint256) {
        uint256 t = totalLastScheduled;
        uint256 n = gaugeTypes;
        if (t > block.timestamp) {
            // If we have already checkpointed - still need to change the value
            t -= WEEK;
        }
        uint256 pt = gaugePointsTotal[t];

        for (uint256 _type = 0; _type < 100; _type++) {
            if (_type == n) {
                break;
            }
            _getTypeSum(_type);
            _getTypeWeight(_type);
        }

        for (uint256 i = 0; i < 500; i++) {
            if (t > block.timestamp) {
                break;
            }
            t += WEEK;
            pt = 0;
            // Scales as n_types * n_unchecked_weeks (hopefully 1 at most)
            for (uint256 _type = 0; _type < 100; _type++) {
                if (_type == n) {
                    break;
                }
                uint256 typeSum = gaugeTypePointsSum[_type][t].bias;
                uint256 typeWeight = gaugeTypePointsWeight[_type][t];
                pt += typeSum * typeWeight;
            }
            gaugePointsTotal[t] = pt;
            if (t > block.timestamp) {
                totalLastScheduled = t;
            }
        }
        return pt;
    }

    /// @notice Get Gauge relative weight (not more than 1.0) normalized to 1e18
    /// (e.g. 1.0 == 1e18). Inflation which will be received by it is
    /// inflation_rate * inflation_weight / 1e18
    /// @param gauge_addr Gauge address
    /// @param _time Relative weight at the specified timestamp in the past or present
    /// @param _chainId the gauge's chainId
    /// @return Value of relative weight normalized to 1e18
    function _gaugeRelativeWeight(
        address gauge_addr,
        uint256 _time,
        uint256 _chainId
    ) internal view returns (uint256) {
        uint256 t = (_time / WEEK) * WEEK;
        uint256 totalWeight = gaugePointsTotal[t];

        if (totalWeight > 0) {
            bytes32 gauge_hash = keccak256(abi.encodePacked(gauge_addr, _chainId));
            uint256 gauge_type = gaugeTypes_[gauge_hash] - 1;
            uint256 typeWeight = gaugeTypePointsWeight[gauge_type][t];
            uint256 gaugeWeight = gaugePointsWeight[gauge_hash][t].bias;
            return (MULTIPLIER * typeWeight * gaugeWeight) / totalWeight;
        } else {
            return 0;
        }
    }

    /// @notice Allocate voting power for changing pool weights
    function _voteFromUser(
        bytes32 gauge_hash,
        address user,
        uint256 _user_weight,
        uint256 slope,
        uint256 lockEnd
    ) internal {
        uint256 nextTime = _getNextTime();
        bytes32 hash = gauge_hash;
        address msg_sender = user;

        // Prepare slopes and biases in memory
        VotedSlope memory old_slope = voteUserSlopes[msg_sender][gauge_hash];
        uint256 old_dt = 0;
        if (old_slope.end > nextTime) {
            old_dt = old_slope.end - nextTime;
        }
        uint256 old_bias = old_slope.slope * old_dt;

        uint256 idx = gaugeIndex_[gauge_hash];
        require(idx > 0, "Gauge not added");

        GaugeInfo memory info = gauges[idx - 1];
        uint256 _user_weight2 = _user_weight;

        VotedSlope memory new_slope = VotedSlope({
            slope: (slope * _user_weight2) / 10000,
            end: lockEnd,
            power: _user_weight2
        });

        uint256 new_dt = lockEnd - nextTime; // dev: raises when expired
        uint256 new_bias = new_slope.slope * new_dt;

        // Check and update powers (weights) used
        uint256 powerUsed = voteUserPower[msg_sender];
        powerUsed = powerUsed + new_slope.power - old_slope.power;
        voteUserPower[msg_sender] = powerUsed;
        require(powerUsed <= 10000, "Used too much power");

        if (old_slope.end > nextTime) {
            _vote1(
                hash,
                old_slope,
                new_slope,
                (old_bias * info.boostMultiplier) / BOOST_PRECISION,
                (new_bias * info.boostMultiplier) / BOOST_PRECISION
            );
        } else {
            _vote2(
                hash,
                new_slope,
                (old_bias * info.boostMultiplier) / BOOST_PRECISION,
                (new_bias * info.boostMultiplier) / BOOST_PRECISION
            );
        }
        if (old_slope.end > block.timestamp) {
            _vote3(
                hash,
                old_slope,
                (old_bias * info.boostMultiplier) / BOOST_PRECISION,
                (new_bias * info.boostMultiplier) / BOOST_PRECISION
            );
        }

        uint256 gauge_type = gaugeTypes_[hash] - 1;

        // Add slope changes for new slopes
        gaugeChangesWeight[hash][new_slope.end] += new_slope.slope;
        gaugeTypeChangesSum[gauge_type][new_slope.end] += new_slope.slope;

        _getTotal();

        voteUserSlopes[msg_sender][hash] = new_slope;
        lastUserVote[msg_sender][hash] = block.timestamp;

        emit VoteForGauge(block.timestamp, msg_sender, hash, new_slope.power);
    }

    /// @notice Allocate voting power for changing pool weights
    function _voteFromAdmin(
        address _gauge_addr,
        uint256 _admin_weight,
        uint256 _end,
        uint256 _chainId
    ) internal {
        uint256 nextTime = _getNextTime();
        require(_end > nextTime || _end == 0, "Your end timestamp expires too soon");
        require(_admin_weight <= 10000, "admin weight is overflow");

        // Update admin total admin slopes
        uint256 totalSupply = VotingEscrow(votingEscrow).totalSupplyAtTime(nextTime);
        adminSlopes[nextTime] = (totalSupply * adminAllocation) / 100 / MAX_LOCK_TIME;

        bytes32 gauge_hash = keccak256(abi.encodePacked(_gauge_addr, _chainId));
        uint256 gauge_type = gaugeTypes_[gauge_hash] - 1;

        // Prepare slopes and biases in memory
        VotedSlope memory old_slope = voteUserSlopes[address(0)][gauge_hash];
        uint256 old_bias = old_slope.slope * MAX_LOCK_TIME;

        uint256 idx = gaugeIndex_[gauge_hash];
        require(idx > 0, "Gauge not added");

        GaugeInfo memory info = gauges[idx - 1];
        uint256 _admin_weight2 = _admin_weight;

        if (_end == 0) {
            _end = block.timestamp + MAX_LOCK_TIME;
        }
        _end = ((_end + WEEK) / WEEK) * WEEK;

        VotedSlope memory new_slope = VotedSlope({
            slope: (adminSlopes[nextTime] * _admin_weight2) / 10000,
            end: _end,
            power: _admin_weight2
        });

        uint256 new_dt = _end - nextTime;
        uint256 new_bias = new_slope.slope * new_dt;

        if (old_slope.end > nextTime) {
            _vote1(
                gauge_hash,
                old_slope,
                new_slope,
                (old_bias * info.boostMultiplier) / BOOST_PRECISION,
                (new_bias * info.boostMultiplier) / BOOST_PRECISION
            );
        } else {
            _vote2(
                gauge_hash,
                new_slope,
                (old_bias * info.boostMultiplier) / BOOST_PRECISION,
                (new_bias * info.boostMultiplier) / BOOST_PRECISION
            );
        }
        if (old_slope.end > block.timestamp) {
            _vote3(
                gauge_hash,
                old_slope,
                (old_bias * info.boostMultiplier) / BOOST_PRECISION,
                (new_bias * info.boostMultiplier) / BOOST_PRECISION
            );
        }
        // Add slope changes for new slopes
        gaugeChangesWeight[gauge_hash][new_slope.end] += new_slope.slope;
        gaugeTypeChangesSum[gauge_type][new_slope.end] += new_slope.slope;

        _getTotal();

        voteUserSlopes[address(0)][gauge_hash] = new_slope;
        lastUserVote[address(0)][gauge_hash] = block.timestamp;

        emit VoteForGaugeFromAdmin(block.timestamp, msg.sender, gauge_hash, new_slope.power);
    }

    /// @notice Allocate voting power for changing pool weights
    function _vote1(
        bytes32 gauge_hash,
        VotedSlope memory old_slope,
        VotedSlope memory new_slope,
        uint256 old_bias,
        uint256 new_bias
    ) internal {
        uint256 next_time = _getNextTime();
        uint256 gauge_type = gaugeTypes_[gauge_hash] - 1;

        uint256 idx = gaugeIndex_[gauge_hash];
        require(idx > 0, "Gauge not added");

        GaugeInfo memory info = gauges[idx - 1];

        // Remove old and schedule new slope changes
        // Remove slope changes for old slopes
        // Schedule recording of initial slope for next_time
        uint256 old_weight_bias = _getWeight(gauge_hash);
        uint256 old_weight_slope = gaugePointsWeight[gauge_hash][next_time].slope;
        uint256 old_sum_bias = _getTypeSum(gauge_type);
        uint256 old_sum_slope = gaugeTypePointsSum[gauge_type][next_time].slope;

        gaugePointsWeight[gauge_hash][next_time].bias =
            (old_weight_bias + new_bias > old_bias ? old_weight_bias + new_bias : old_bias) -
            old_bias;
        gaugeTypePointsSum[gauge_type][next_time].bias =
            (old_sum_bias + new_bias > old_bias ? old_sum_bias + new_bias : old_bias) -
            old_bias;
        gaugePointsWeight[gauge_hash][next_time].slope =
            (
                old_weight_slope + new_slope.slope > old_slope.slope
                    ? old_weight_slope + new_slope.slope
                    : old_slope.slope
            ) -
            old_slope.slope;
        gaugeTypePointsSum[gauge_type][next_time].slope =
            (old_sum_slope + new_slope.slope > old_slope.slope ? old_sum_slope + new_slope.slope : old_slope.slope) -
            old_slope.slope;
    }

    /// @notice Allocate voting power for changing pool weights
    function _vote2(
        bytes32 gauge_hash,
        VotedSlope memory new_slope,
        uint256 old_bias,
        uint256 new_bias
    ) internal {
        uint256 next_time = _getNextTime();
        uint256 gauge_type = gaugeTypes_[gauge_hash] - 1;

        uint256 idx = gaugeIndex_[gauge_hash];
        require(idx > 0, "Gauge not added");

        GaugeInfo memory info = gauges[idx - 1];

        // Remove old and schedule new slope changes
        // Remove slope changes for old slopes
        // Schedule recording of initial slope for next_time
        uint256 old_weight_bias = _getWeight(gauge_hash);
        uint256 old_sum_bias = _getTypeSum(gauge_type);

        gaugePointsWeight[gauge_hash][next_time].bias =
            (old_weight_bias + new_bias > old_bias ? old_weight_bias + new_bias : old_bias) -
            old_bias;
        gaugeTypePointsSum[gauge_type][next_time].bias =
            (old_sum_bias + new_bias > old_bias ? old_sum_bias + new_bias : old_bias) -
            old_bias;
        gaugePointsWeight[gauge_hash][next_time].slope += new_slope.slope;
        gaugeTypePointsSum[gauge_type][next_time].slope += new_slope.slope;
    }

    /// @notice Allocate voting power for changing pool weights
    function _vote3(
        bytes32 gauge_hash,
        VotedSlope memory old_slope,
        uint256 old_bias,
        uint256 new_bias
    ) internal {
        uint256 gauge_type = gaugeTypes_[gauge_hash] - 1;

        gaugeChangesWeight[gauge_hash][old_slope.end] -= old_slope.slope;
        gaugeTypeChangesSum[gauge_type][old_slope.end] -= old_slope.slope;
    }
}
