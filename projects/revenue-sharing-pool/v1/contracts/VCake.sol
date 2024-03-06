// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin-4.5.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin-4.5.0/contracts/access/Ownable.sol";
import "./libraries/SafeCast.sol";
import "./interfaces/ICakePool.sol";
import "./interfaces/IMasterChefV2.sol";

contract VCake is Ownable {
    using SafeERC20 for IERC20;

    struct Point {
        int128 bias; // Voting weight
        int128 slope; // Multiplier factor to get voting weight at a given time
        uint256 timestamp;
        uint256 blockNumber;
    }

    struct LockedBalance {
        int128 amount;
        uint256 end;
    }

    uint256 public constant WEEK = 7 days;
    uint256 public constant MULTIPLIER = 10**18;
    uint256 public UNLOCK_FREE_DURATION = 1 weeks; // 1 week
    uint256 public DURATION_FACTOR_OVERDUE = 180 days; // 180 days, in order to calculate overdue fee.
    uint256 public constant PRECISION_FACTOR = 1e12; // precision factor.

    uint256 public MAX_LOCK = 365 days; // 365 days , set default same with cake pool.

    ICakePool public immutable CakePool;
    IMasterChefV2 public immutable MasterchefV2;
    uint256 public immutable CakePoolPID;

    // A global point of time.
    uint256 public epoch;
    // An array of points (global).
    Point[] public pointHistory;
    // Mapping (user => Point) to keep track of user point of a given epoch (index of Point is epoch)
    mapping(address => Point[]) public userPointHistory;
    // Mapping (user => epoch) to keep track which epoch user at
    mapping(address => uint256) public userPointEpoch;
    // Mapping (round off timestamp to week => slopeDelta) to keep track slope changes over epoch
    mapping(uint256 => int128) public slopeChanges;
    // Mapping (user => bool) to keep track whether user had initialized
    mapping(address => bool) public initialization;
    // Mapping (user => bool) to keep track of user previous locked amount
    mapping(address => uint256) public userPrevLockedAmount;

    // --- BEP20 compatible variables ---
    string public name;
    string public symbol;
    uint8 public decimals;

    event Sync(address indexed user, uint256 lockedAmount);
    event RemoveUserInitialization(address indexed _user);
    event NewMaxLock(uint256 maxLock);

    modifier onlyCakePool() {
        require(msg.sender == address(CakePool), "Not cake pool");
        _;
    }

    modifier onlyNotInitialized() {
        require(!initialization[msg.sender], "Already initialized");
        _;
    }

    /**
     * @notice Constructor
     * @param _cakePool: Cake Pool contract
     * @param _masterchefV2: MasterChefV2 contract
     * @param _pid: cake pool ID in MasterChefV2
     */
    constructor(
        ICakePool _cakePool,
        IMasterChefV2 _masterchefV2,
        uint256 _pid
    ) {
        CakePool = _cakePool;
        MasterchefV2 = _masterchefV2;
        CakePoolPID = _pid;

        pointHistory.push(Point({bias: 0, slope: 0, timestamp: block.timestamp, blockNumber: block.number}));

        decimals = 18;

        name = "VCake";
        symbol = "VCake";
    }

    /// @notice Return the balance of VCake at a given "_blockNumber"
    /// @param _user The address to get a balance of VCake
    /// @param _blockNumber The speicific block number that you want to check the balance of VCake
    function balanceOfAt(address _user, uint256 _blockNumber) external view returns (uint256) {
        require(_blockNumber <= block.number, "bad _blockNumber");

        // Get most recent user Point to block
        uint256 _userEpoch = _findUserBlockEpoch(_user, _blockNumber);
        if (_userEpoch == 0) {
            return 0;
        }
        Point memory _userPoint = userPointHistory[_user][_userEpoch];

        // Get most recent global point to block
        uint256 _maxEpoch = epoch;
        uint256 _epoch = _findBlockEpoch(_blockNumber, _maxEpoch);
        Point memory _point0 = pointHistory[_epoch];

        uint256 _blockDelta = 0;
        uint256 _timeDelta = 0;
        if (_epoch < _maxEpoch) {
            Point memory _point1 = pointHistory[_epoch + 1];
            _blockDelta = _point1.blockNumber - _point0.blockNumber;
            _timeDelta = _point1.timestamp - _point0.timestamp;
        } else {
            _blockDelta = block.number - _point0.blockNumber;
            _timeDelta = block.timestamp - _point0.timestamp;
        }
        uint256 _blockTime = _point0.timestamp;
        if (_blockDelta != 0) {
            _blockTime += (_timeDelta * (_blockNumber - _point0.blockNumber)) / _blockDelta;
        }

        _userPoint.bias -= (_userPoint.slope * SafeCast.toInt128(int256(_blockTime - _userPoint.timestamp)));

        if (_userPoint.bias < 0) {
            return 0;
        }

        return SafeCast.toUint256(_userPoint.bias);
    }

    /// @notice Return the voting weight of a givne user
    /// @param _user The address of a user
    function balanceOf(address _user) external view returns (uint256) {
        uint256 _epoch = userPointEpoch[_user];
        if (_epoch == 0) {
            return 0;
        }
        Point memory _lastPoint = userPointHistory[_user][_epoch];
        _lastPoint.bias =
            _lastPoint.bias -
            (_lastPoint.slope * SafeCast.toInt128(int256(block.timestamp - _lastPoint.timestamp)));
        if (_lastPoint.bias < 0) {
            _lastPoint.bias = 0;
        }
        return SafeCast.toUint256(_lastPoint.bias);
    }

    /// @notice Record global and per-user slope to checkpoint
    /// @param _address User's wallet address. Only global if 0x0
    /// @param _prevLocked User's previous locked balance and end lock time
    /// @param _newLocked User's new locked balance and end lock time
    function _checkpoint(
        address _address,
        LockedBalance memory _prevLocked,
        LockedBalance memory _newLocked
    ) internal {
        Point memory _userPrevPoint = Point({slope: 0, bias: 0, timestamp: 0, blockNumber: 0});
        Point memory _userNewPoint = Point({slope: 0, bias: 0, timestamp: 0, blockNumber: 0});

        int128 _prevSlopeDelta = 0;
        int128 _newSlopeDelta = 0;
        uint256 _epoch = epoch;

        // if not 0x0, then update user's point
        if (_address != address(0)) {
            // Calculate slopes and biases according to linear decay graph
            // slope = lockedAmount / MAX_LOCK => Get the slope of a linear decay graph
            // bias = slope * (lockedEnd - currentTimestamp) => Get the voting weight at a given time
            // Kept at zero when they have to
            if (_prevLocked.end > block.timestamp && _prevLocked.amount > 0) {
                // Calculate slope and bias for the prev point
                _userPrevPoint.slope = _prevLocked.amount / SafeCast.toInt128(int256(MAX_LOCK));
                _userPrevPoint.bias =
                    _userPrevPoint.slope *
                    SafeCast.toInt128(int256(_prevLocked.end - block.timestamp));
            }
            if (_newLocked.end > block.timestamp && _newLocked.amount > 0) {
                // Calculate slope and bias for the new point
                _userNewPoint.slope = _newLocked.amount / SafeCast.toInt128(int256(MAX_LOCK));
                _userNewPoint.bias = _userNewPoint.slope * SafeCast.toInt128(int256(_newLocked.end - block.timestamp));
            }

            // Handle user history here
            // Do it here to prevent stack overflow
            uint256 _userEpoch = userPointEpoch[_address];
            // If user never ever has any point history, push it here for him.
            if (_userEpoch == 0) {
                userPointHistory[_address].push(_userPrevPoint);
            }

            // Shift user's epoch by 1 as we are writing a new point for a user
            userPointEpoch[_address] = _userEpoch + 1;

            // Update timestamp & block number then push new point to user's history
            _userNewPoint.timestamp = block.timestamp;
            _userNewPoint.blockNumber = block.number;
            userPointHistory[_address].push(_userNewPoint);

            // Read values of scheduled changes in the slope
            // _prevLocked.end can be in the past and in the future
            // _newLocked.end can ONLY be in the FUTURE unless everything expired (anything more than zeros)
            _prevSlopeDelta = slopeChanges[_prevLocked.end];
            if (_newLocked.end != 0) {
                // Handle when _newLocked.end != 0
                if (_newLocked.end == _prevLocked.end) {
                    // This will happen when user adjust lock but end remains the same
                    // Possibly when user deposited more Cake to his locker
                    _newSlopeDelta = _prevSlopeDelta;
                } else {
                    // This will happen when user increase lock
                    _newSlopeDelta = slopeChanges[_newLocked.end];
                }
            }
        }

        // Handle global states here
        Point memory _lastPoint = Point({bias: 0, slope: 0, timestamp: block.timestamp, blockNumber: block.number});
        if (_epoch > 0) {
            // If _epoch > 0, then there is some history written
            // Hence, _lastPoint should be pointHistory[_epoch]
            // else _lastPoint should an empty point
            _lastPoint = pointHistory[_epoch];
        }
        // _lastCheckpoint => timestamp of the latest point
        // if no history, _lastCheckpoint should be block.timestamp
        // else _lastCheckpoint should be the timestamp of latest pointHistory
        uint256 _lastCheckpoint = _lastPoint.timestamp;

        // initialLastPoint is used for extrapolation to calculate block number
        // (approximately, for xxxAt methods) and save them
        // as we cannot figure that out exactly from inside contract
        Point memory _initialLastPoint = Point({
            bias: 0,
            slope: 0,
            timestamp: _lastPoint.timestamp,
            blockNumber: _lastPoint.blockNumber
        });

        // If last point is already recorded in this block, _blockSlope=0
        // That is ok because we know the block in such case
        uint256 _blockSlope = 0;
        if (block.timestamp > _lastPoint.timestamp) {
            // Recalculate _blockSlope if _lastPoint.timestamp < block.timestamp
            // Possiblity when epoch = 0 or _blockSlope hasn't get updated in this block
            _blockSlope =
                (MULTIPLIER * (block.number - _lastPoint.blockNumber)) /
                (block.timestamp - _lastPoint.timestamp);
        }

        // Go over weeks to fill history and calculate what the current point is
        uint256 _weekCursor = _timestampToFloorWeek(_lastCheckpoint);
        for (uint256 i = 0; i < 255; i++) {
            // This logic will works for 5 years, if more than that vote power will be broken 😟
            // Bump _weekCursor a week
            _weekCursor = _weekCursor + WEEK;
            int128 _slopeDelta = 0;
            if (_weekCursor > block.timestamp) {
                // If the given _weekCursor go beyond block.timestamp,
                // We take block.timestamp as the cursor
                _weekCursor = block.timestamp;
            } else {
                // If the given _weekCursor is behind block.timestamp
                // We take _slopeDelta from the recorded slopeChanges
                // We can use _weekCursor directly because key of slopeChanges is timestamp round off to week
                _slopeDelta = slopeChanges[_weekCursor];
            }
            // Calculate _biasDelta = _lastPoint.slope * (_weekCursor - _lastCheckpoint)
            int128 _biasDelta = _lastPoint.slope * SafeCast.toInt128(int256((_weekCursor - _lastCheckpoint)));
            _lastPoint.bias = _lastPoint.bias - _biasDelta;
            _lastPoint.slope = _lastPoint.slope + _slopeDelta;
            if (_lastPoint.bias < 0) {
                // This can happen
                _lastPoint.bias = 0;
            }
            if (_lastPoint.slope < 0) {
                // This cannot happen, just make sure
                _lastPoint.slope = 0;
            }
            // Update _lastPoint to the new one
            _lastCheckpoint = _weekCursor;
            _lastPoint.timestamp = _weekCursor;
            // As we cannot figure that out block timestamp -> block number exactly
            // when query states from xxxAt methods, we need to calculate block number
            // based on _initalLastPoint
            _lastPoint.blockNumber =
                _initialLastPoint.blockNumber +
                ((_blockSlope * ((_weekCursor - _initialLastPoint.timestamp))) / MULTIPLIER);
            _epoch = _epoch + 1;
            if (_weekCursor == block.timestamp) {
                // Hard to be happened, but better handling this case too
                _lastPoint.blockNumber = block.number;
                break;
            } else {
                pointHistory.push(_lastPoint);
            }
        }
        // Now, each week pointHistory has been filled until current timestamp (round off by week)
        // Update epoch to be the latest state
        epoch = _epoch;

        if (_address != address(0)) {
            // If the last point was in the block, the slope change should have been applied already
            // But in such case slope shall be 0
            _lastPoint.slope = _lastPoint.slope + _userNewPoint.slope - _userPrevPoint.slope;
            _lastPoint.bias = _lastPoint.bias + _userNewPoint.bias - _userPrevPoint.bias;
            if (_lastPoint.slope < 0) {
                _lastPoint.slope = 0;
            }
            if (_lastPoint.bias < 0) {
                _lastPoint.bias = 0;
            }
        }

        // Record the new point to pointHistory
        // This would be the latest point for global epoch
        pointHistory.push(_lastPoint);

        if (_address != address(0)) {
            // Schedule the slope changes (slope is going downward)
            // We substract _newSlopeDelta from `_newLocked.end`
            // and add _prevSlopeDelta to `_prevLocked.end`
            if (_prevLocked.end > block.timestamp) {
                // _prevSlopeDelta was <something> - _userPrevPoint.slope, so we offset that first
                _prevSlopeDelta = _prevSlopeDelta + _userPrevPoint.slope;
                if (_newLocked.end == _prevLocked.end) {
                    // Handle the new deposit. Not increasing lock.
                    _prevSlopeDelta = _prevSlopeDelta - _userNewPoint.slope;
                }
                slopeChanges[_prevLocked.end] = _prevSlopeDelta;
            }
            if (_newLocked.end > block.timestamp) {
                if (_newLocked.end > _prevLocked.end) {
                    // At this line, the old slope should gone
                    _newSlopeDelta = _newSlopeDelta - _userNewPoint.slope;
                    slopeChanges[_newLocked.end] = _newSlopeDelta;
                }
            }
        }
    }

    /// @notice Trigger global checkpoint
    function checkpoint() external {
        LockedBalance memory empty = LockedBalance({amount: 0, end: 0});
        _checkpoint(address(0), empty, empty);
    }

    function syncFromCakePool() external onlyNotInitialized {
        initialization[msg.sender] = true;
        (, , , , , uint256 lockEndTime, , , uint256 lockedAmount) = CakePool.userInfo(msg.sender);

        if (lockedAmount > 0 && lockEndTime > block.timestamp) {
            userPrevLockedAmount[msg.sender] = lockedAmount;
            LockedBalance memory prevLocked = LockedBalance({amount: 0, end: 0});

            LockedBalance memory newLocked = LockedBalance({
                amount: SafeCast.toInt128(int256(lockedAmount)),
                end: _timestampToFloorWeek(lockEndTime)
            });

            _checkpoint(msg.sender, prevLocked, newLocked);
        }

        emit Sync(msg.sender, lockedAmount);
    }

    struct DepositCache {
        uint256 shares;
        uint256 cakeAtLastUserAction;
        uint256 lockStartTime;
        uint256 lockEndTime;
        uint256 userBoostedShare;
        bool locked;
        uint256 lockedAmount;
        uint256 cakePoolAvailable;
    }

    /// @notice Deposit in cake pool
    /// @param _user user address
    /// @param _amount: number of tokens to deposit (in CAKE)
    /// @param _lockDuration: Token lock duration
    function deposit(
        address _user,
        uint256 _amount,
        uint256 _lockDuration
    ) external onlyCakePool {
        if (initialization[_user]) {
            DepositCache memory cache;
            (
                cache.shares,
                ,
                cache.cakeAtLastUserAction,
                ,
                cache.lockStartTime,
                cache.lockEndTime,
                cache.userBoostedShare,
                cache.locked,
                cache.lockedAmount
            ) = CakePool.userInfo(_user);
            LockedBalance memory prevLocked = LockedBalance({
                amount: SafeCast.toInt128(int256(userPrevLockedAmount[_user])),
                end: _timestampToFloorWeek(cache.lockEndTime)
            });

            uint256 totalShares = CakePool.totalShares();
            uint256 totalBoostDebt = CakePool.totalBoostDebt();
            cache.cakePoolAvailable = CakePool.available();

            // need to calculate pendding cake when harvest
            uint256 pendingCake = MasterchefV2.pendingCake(CakePoolPID, address(CakePool));
            if (pendingCake > 0) {
                cache.cakePoolAvailable += pendingCake;
            }

            // simulate CakePool.updateUserShare() function
            if (cache.shares > 0) {
                if (cache.locked) {
                    // Calculate the user's current token amount and update related parameters.
                    uint256 currentAmount = ((cache.cakePoolAvailable + totalBoostDebt) * (cache.shares)) /
                        totalShares -
                        cache.userBoostedShare;
                    totalBoostDebt -= cache.userBoostedShare;
                    cache.userBoostedShare = 0;
                    totalShares -= cache.shares;
                    //Charge a overdue fee after the free duration has expired.
                    if (
                        !CakePool.freeOverdueFeeUsers(_user) &&
                        ((cache.lockEndTime + UNLOCK_FREE_DURATION) < block.timestamp)
                    ) {
                        uint256 earnAmount = currentAmount - cache.lockedAmount;
                        uint256 overdueDuration = block.timestamp - cache.lockEndTime - UNLOCK_FREE_DURATION;
                        if (overdueDuration > DURATION_FACTOR_OVERDUE) {
                            overdueDuration = DURATION_FACTOR_OVERDUE;
                        }
                        // Rates are calculated based on the user's overdue duration.
                        uint256 overdueWeight = (overdueDuration * CakePool.overdueFee()) / DURATION_FACTOR_OVERDUE;
                        uint256 currentOverdueFee = (earnAmount * overdueWeight) / PRECISION_FACTOR;
                        cache.cakePoolAvailable -= currentOverdueFee;

                        currentAmount -= currentOverdueFee;
                    }
                    // Recalculate the user's share.
                    uint256 currentShares;
                    if (totalShares != 0) {
                        currentShares =
                            (currentAmount * totalShares) /
                            ((cache.cakePoolAvailable + totalBoostDebt) - currentAmount);
                    } else {
                        currentShares = currentAmount;
                    }
                    cache.shares = currentShares;
                    totalShares += currentShares;
                    // After the lock duration, update related parameters.
                    if (cache.lockEndTime < block.timestamp) {
                        cache.locked = false;
                        cache.lockStartTime = 0;
                        cache.lockEndTime = 0;
                        cache.lockedAmount = 0;
                    }
                } else if (!CakePool.freePerformanceFeeUsers(_user)) {
                    // Calculate Performance fee.
                    uint256 totalAmount = (cache.shares * (cache.cakePoolAvailable + totalBoostDebt)) / totalShares;
                    totalShares -= cache.shares;
                    cache.shares = 0;
                    uint256 earnAmount = totalAmount - cache.cakeAtLastUserAction;
                    uint256 feeRate = CakePool.performanceFee();
                    if (_isContract(_user)) {
                        feeRate = CakePool.performanceFeeContract();
                    }
                    uint256 currentPerformanceFee = (earnAmount * feeRate) / 10000;
                    if (currentPerformanceFee > 0) {
                        cache.cakePoolAvailable -= currentPerformanceFee;

                        totalAmount -= currentPerformanceFee;
                    }
                    // Recalculate the user's share.
                    uint256 newShares;
                    if (totalShares != 0) {
                        newShares =
                            (totalAmount * totalShares) /
                            ((cache.cakePoolAvailable + totalBoostDebt) - totalAmount);
                    } else {
                        newShares = totalAmount;
                    }
                    cache.shares = newShares;
                    totalShares += newShares;
                }
            }

            // Update lock duration.
            if (_lockDuration > 0) {
                if (cache.lockEndTime < block.timestamp) {
                    cache.lockStartTime = block.timestamp;
                    cache.lockEndTime = block.timestamp + _lockDuration;
                } else {
                    cache.lockEndTime += _lockDuration;
                }
                cache.locked = true;
            }

            // Calculate lock funds
            if (cache.shares > 0 && cache.locked) {
                // Update lock amount
                if (cache.lockStartTime == block.timestamp) {
                    cache.lockedAmount = ((cache.cakePoolAvailable + totalBoostDebt) * cache.shares) / totalShares;
                }
            }

            // Calculate the boost weight share.
            if (cache.lockEndTime > cache.lockStartTime) {
                cache.lockedAmount += _amount;
            }

            LockedBalance memory newLocked = LockedBalance({
                amount: SafeCast.toInt128(int256(cache.lockedAmount)),
                end: _timestampToFloorWeek(cache.lockEndTime)
            });
            userPrevLockedAmount[_user] = cache.lockedAmount;
            _checkpoint(_user, prevLocked, newLocked);
        }
    }

    /// @notice Withdraw in cake pool
    /// @param _user user address
    function withdraw(address _user) external onlyCakePool {
        if (initialization[_user]) {
            (, , , , , uint256 lockEndTime, , , uint256 lockedAmount) = CakePool.userInfo(_user);
            LockedBalance memory prevLocked = LockedBalance({
                amount: SafeCast.toInt128(int256(lockedAmount)),
                end: _timestampToFloorWeek(lockEndTime)
            });

            LockedBalance memory newLocked = LockedBalance({amount: 0, end: 0});
            userPrevLockedAmount[_user] = 0;

            _checkpoint(_user, prevLocked, newLocked);
        }
    }

    /// @notice Do Binary Search to find out block timestamp for block number
    /// @param _blockNumber The block number to find timestamp
    /// @param _maxEpoch No beyond this timestamp
    function _findBlockEpoch(uint256 _blockNumber, uint256 _maxEpoch) internal view returns (uint256) {
        uint256 _min = 0;
        uint256 _max = _maxEpoch;
        // Loop for 128 times -> enough for 128-bit numbers
        for (uint256 i = 0; i < 128; i++) {
            if (_min >= _max) {
                break;
            }
            uint256 _mid = (_min + _max + 1) / 2;
            if (pointHistory[_mid].blockNumber <= _blockNumber) {
                _min = _mid;
            } else {
                _max = _mid - 1;
            }
        }
        return _min;
    }

    /// @notice Do Binary Search to find the most recent user point history preceeding block
    /// @param _user The address of user to find
    /// @param _blockNumber Find the most recent point history before this block number
    function _findUserBlockEpoch(address _user, uint256 _blockNumber) internal view returns (uint256) {
        uint256 _min = 0;
        uint256 _max = userPointEpoch[_user];
        for (uint256 i = 0; i < 128; i++) {
            if (_min >= _max) {
                break;
            }
            uint256 _mid = (_min + _max + 1) / 2;
            if (userPointHistory[_user][_mid].blockNumber <= _blockNumber) {
                _min = _mid;
            } else {
                _max = _mid - 1;
            }
        }
        return _min;
    }

    /// @notice Round off random timestamp to week
    /// @param _timestamp The timestamp to be rounded off
    function _timestampToFloorWeek(uint256 _timestamp) internal pure returns (uint256) {
        return (_timestamp / WEEK) * WEEK;
    }

    /// @notice Calculate total supply of VCake (voting power)
    function totalSupply() external view returns (uint256) {
        return _totalSupplyAt(pointHistory[epoch], block.timestamp);
    }

    /// @notice Calculate total supply of VCake at specific block
    /// @param _blockNumber The specific block number to calculate totalSupply
    function totalSupplyAt(uint256 _blockNumber) external view returns (uint256) {
        require(_blockNumber <= block.number, "bad _blockNumber");
        uint256 _epoch = epoch;
        uint256 _targetEpoch = _findBlockEpoch(_blockNumber, _epoch);

        Point memory _point = pointHistory[_targetEpoch];
        uint256 _timeDelta = 0;
        if (_targetEpoch < _epoch) {
            Point memory _nextPoint = pointHistory[_targetEpoch + 1];
            if (_point.blockNumber != _nextPoint.blockNumber) {
                _timeDelta =
                    ((_blockNumber - _point.blockNumber) * (_nextPoint.timestamp - _point.timestamp)) /
                    (_nextPoint.blockNumber - _point.blockNumber);
            }
        } else {
            if (_point.blockNumber != block.number) {
                _timeDelta =
                    ((_blockNumber - _point.blockNumber) * (block.timestamp - _point.timestamp)) /
                    (block.number - _point.blockNumber);
            }
        }

        return _totalSupplyAt(_point, _point.timestamp + _timeDelta);
    }

    /// @notice Calculate total supply of VCake (voting power) at some point in the past
    /// @param _point The point to start to search from
    /// @param _timestamp The timestamp to calculate the total voting power at
    function _totalSupplyAt(Point memory _point, uint256 _timestamp) internal view returns (uint256) {
        Point memory _lastPoint = _point;
        uint256 _weekCursor = _timestampToFloorWeek(_point.timestamp);
        // Iterate through weeks to take slopChanges into the account
        for (uint256 i = 0; i < 255; i++) {
            _weekCursor = _weekCursor + WEEK;
            int128 _slopeDelta = 0;
            if (_weekCursor > _timestamp) {
                // If _weekCursor goes beyond _timestamp -> leave _slopeDelta
                // to be 0 as there is no more slopeChanges
                _weekCursor = _timestamp;
            } else {
                // If _weekCursor still behind _timestamp, then _slopeDelta
                // should be taken into the account.
                _slopeDelta = slopeChanges[_weekCursor];
            }
            // Update bias at _weekCursor
            _lastPoint.bias =
                _lastPoint.bias -
                (_lastPoint.slope * SafeCast.toInt128(int256(_weekCursor - _lastPoint.timestamp)));
            if (_weekCursor == _timestamp) {
                break;
            }
            // Update slope and timestamp
            _lastPoint.slope = _lastPoint.slope + _slopeDelta;
            _lastPoint.timestamp = _weekCursor;
        }

        if (_lastPoint.bias < 0) {
            _lastPoint.bias = 0;
        }

        return SafeCast.toUint256(_lastPoint.bias);
    }

    /**
     * @notice Checks if address is a contract
     */
    function _isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }

    /// @notice Remove user initialization status.
    /// @dev Avoid issues caused by _checkpoint, causing user assets to be stuck.
    /// @param _users The array of addresses.
    function removeUserInitialization(address[] calldata _users) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            initialization[_users[i]] = false;
            emit RemoveUserInitialization(_users[i]);
        }
    }

    /// @notice Set MAX_LOCK
    /// @dev Only callable by the contract admin.
    /// @param _maxLock Max lock duration.
    function setMaxLock(uint256 _maxLock) external onlyOwner {
        MAX_LOCK = _maxLock;
        emit NewMaxLock(_maxLock);
    }
}
