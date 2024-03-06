// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin-4.5.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin-4.5.0/contracts/access/Ownable.sol";
import "@openzeppelin-4.5.0/contracts/security/ReentrancyGuard.sol";
import "../libraries/SafeCast.sol";
import "../interfaces/ICakePool.sol";
import "../interfaces/IProxyForCakePoolFactory.sol";
import "../interfaces/IProxyForCakePool.sol";
import "../interfaces/IDelegator.sol";
import "../interfaces/IFarmBooster.sol";

contract VECakeTest is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Events ---
    event Deposit(address indexed locker, uint256 value, uint256 indexed lockTime, uint256 lockType, uint256 timestamp);
    event WithdrawAll(address indexed locker, address indexed to, uint256 value, uint256 timestamp);
    event EarlyWithdraw(address indexed locker, address indexed to, uint256 value, uint256 penalty, uint256 timestamp);
    event SetBreaker(uint256 previousBreaker, uint256 breaker);
    event Supply(uint256 previousSupply, uint256 supply);
    event SetEarlyWithdrawConfig(
        address indexed caller,
        uint64 oldEarlyWithdrawFeeBps,
        uint64 newEarlyWithdrawFeeBps,
        uint64 oldRedistributeBps,
        uint64 newRedistribiteBps,
        address oldTreasuryAddr,
        address newTreasuryAddr,
        address oldRedistributeAddr,
        address newRedistributeAddr
    );
    event Redistribute(address indexed caller, address destination, uint256 amount);
    event SetWhitelistedCaller(address indexed caller, address indexed addr, bool ok);
    event SetWhitelistedRedistributors(address indexed caller, address indexed addr, bool ok);
    event MigrateFromCakePool(address indexed user, address indexed proxy, uint256 amount, uint256 endTime);
    event DelegateFromCakePool(address indexed user, address indexed delegator, uint256 amount, uint256 endTime);
    event MigrationConvertToDelegation(
        address indexed user,
        address indexed delegator,
        uint256 amount,
        uint256 endTime
    );
    event UpdateDelegator(address indexed delegator, bool isDelegator, uint40 limitTimestampForEarlyWithdraw);
    event InjectToDelegator(address indexed user, address indexed delegator, uint256 amount);
    event SetLimitTimeOfConvert(address indexed user, uint256 newValue);
    event SetEarlyWithdrawSwitch(address indexed user, bool newValue);
    event SetNoPenaltyForEarlyWithdraw(address indexed owner, address indexed user, bool indexed newValue);
    event SetEmergencyWithdrawSwitch(address indexed user, bool newValue);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event NewFarmBooster(address indexed farmBooster);

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

    struct UserInfo {
        address cakePoolProxy; // Proxy Smart Contract for users who had locked in cake pool.
        uint128 cakeAmount; //  Cake amount locked in cake pool.
        uint48 lockEndTime; // Record the lockEndTime in cake pool.
        uint48 migrationTime; // Record the migration time.
        uint16 cakePoolType; // 1: Migration, 2: Delegation.
        uint16 withdrawFlag; // 0: Not withdraw, 1 : withdrew.
    }

    // When user delegated their locked cake to delegator from cake pool, the locked cake will permanently locked in the cake pool, which is equivalent to burn it.
    // And pancake team will inject cake to the delegator from the burning part which was originally intended to be burned in the future.
    struct Delegator {
        uint104 delegatedCakeAmount; // The total cake amount delegated from cake pool.
        uint104 notInjectedCakeAmount; // The cake amount which pancake have not injected to the delegator.
        uint40 limitTimestampForEarlyWithdraw; // Delegator can not call earlyWithdraw before limit timestamp.
        uint8 isDelegator; // 0: Not delegator , 1: Delegator
    }

    // --- Constants ---
    uint16 public constant MIGRATION_FROM_CAKE_POOL_FLAG = 1;
    uint16 public constant DELEGATION_FROM_CAKE_POOL_FLAG = 2;
    uint16 public constant NOT_WITHDRAW_FLAG = 0;
    uint16 public constant WITHDREW_FLAG = 1;
    uint8 public constant NOT_DELEGATOR_FLAG = 0;
    uint8 public constant DELEGATOR_FLAG = 1;

    uint256 public constant ACTION_DEPOSIT_FOR = 0;
    uint256 public constant ACTION_CREATE_LOCK = 1;
    uint256 public constant ACTION_INCREASE_LOCK_AMOUNT = 2;
    uint256 public constant ACTION_INCREASE_UNLOCK_TIME = 3;

    uint256 public constant WEEK = 7 days;
    // MAX_LOCK 209 weeks - 1 seconds
    uint256 public constant MAX_LOCK = (209 * WEEK) - 1;
    uint256 public constant MULTIPLIER = 10**18;

    // Token to be locked (Cake)
    IERC20 public immutable token;
    // Total supply of Cake that get locked
    uint256 public supply;

    ICakePool public immutable CakePool;

    IProxyForCakePoolFactory public immutable ProxyForCakePoolFactory;

    IFarmBooster public FarmBooster;

    // Cake pool migation initialization flag
    bool public initialization;

    // The limit time for migration convert to delegation, default is 2 weeks
    uint256 public limitTimeOfConvert = 2 weeks;

    // Allow to emergency withdraw or not
    bool public emergencyWithdrawSwitch;

    // Record whether user had used emergencyWithdraw
    mapping(address => bool) public everEmergencyWithdraw;

    // Mapping (user => LockedBalance) to keep locking information for each user
    mapping(address => LockedBalance) public locks;

    // Mapping (user => UserInfo) to keep cake pool related information for each user
    mapping(address => UserInfo) public userInfo;

    // Mapping (address => Delegator) to keep delegator related information
    mapping(address => Delegator) public delegator;

    // Mapping (user => Bool) to check whether this user is cake pool proxy smart contract
    mapping(address => bool) public isCakePoolProxy;

    // Mapping (user => Bool) to check whether this user will have penalty for ealy withdraw
    mapping(address => bool) public noPenaltyForEarlyWithdraw;

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

    // Circuit breaker
    uint256 public breaker;

    string public name;
    string public symbol;
    uint8 public decimals;

    // --- Early Withdrawal Configs ---
    uint64 public earlyWithdrawBpsPerWeek;
    uint64 public redistributeBps;
    uint256 public accumRedistribute;
    address public treasuryAddr;
    address public redistributeAddr;

    // Allow to early withdraw or not
    bool public earlyWithdrawSwitch;

    // --- whitelist address  ---
    mapping(address => bool) public whitelistedCallers;
    mapping(address => bool) public whitelistedRedistributors;

    modifier onlyRedistributors() {
        require(whitelistedRedistributors[msg.sender], "! wl redistributors");
        _;
    }

    modifier onlyEOAorWhitelisted() {
        if (!whitelistedCallers[msg.sender]) {
            require(msg.sender == tx.origin, "! eoa or wl");
        }
        _;
    }

    modifier onlyCakePool() {
        require(msg.sender == address(CakePool), "! cake pool");
        _;
    }

    /**
     * @notice Constructor
     * @param _cakePool: Cake Pool contract
     * @param _token: Cake Token contract
     * @param _ProxyForCakePoolFactory The cake pool proxy factory
     */
    constructor(
        ICakePool _cakePool,
        IERC20 _token,
        IProxyForCakePoolFactory _ProxyForCakePoolFactory
    ) {
        CakePool = _cakePool;
        token = _token;
        ProxyForCakePoolFactory = _ProxyForCakePoolFactory;

        pointHistory.push(Point({bias: 0, slope: 0, timestamp: block.timestamp, blockNumber: block.number}));

        decimals = 18;

        name = "Vote-escrowed Cake";
        symbol = "veCake";
    }

    /// @notice Initialize for cake pool migration
    /// @dev Need to check whether cake pool conditions are met
    function initializeCakePoolMigration() external onlyOwner {
        require(!initialization, "Already initialized");
        address VCakeInCakePool = CakePool.VCake();
        require(VCakeInCakePool == address(this), "Bad VCake");
        initialization = true;
    }

    /// @notice Return user information include LockedBalance and UserInfo
    /// @param _user The user address
    /// @return amount The user lock amount
    /// @return end The user lock end time
    /// @return cakePoolProxy Proxy Smart Contract for users who had locked in cake pool
    /// @return cakeAmount Cake amount locked in cake pool
    /// @return lockEndTime Record the lockEndTime in cake pool
    /// @return migrationTime Record the migration time
    /// @return cakePoolType 1: Migration, 2: Delegation
    /// @return withdrawFlag 0: Not withdraw, 1 : withdrew
    function getUserInfo(address _user)
        external
        view
        returns (
            int128 amount,
            uint256 end,
            address cakePoolProxy,
            uint128 cakeAmount,
            uint48 lockEndTime,
            uint48 migrationTime,
            uint16 cakePoolType,
            uint16 withdrawFlag
        )
    {
        LockedBalance memory lock = locks[_user];
        UserInfo memory user = userInfo[_user];
        amount = lock.amount;
        end = lock.end;
        cakePoolProxy = user.cakePoolProxy;
        cakeAmount = user.cakeAmount;
        lockEndTime = user.lockEndTime;
        migrationTime = user.migrationTime;
        cakePoolType = user.cakePoolType;
        withdrawFlag = user.withdrawFlag;
    }

    /// @notice Return the proxy balance of VECake at a given "_blockNumber"
    /// @param _user The proxy owner address to get a balance of VECake
    /// @param _blockNumber The speicific block number that you want to check the balance of VECake
    function balanceOfAtForProxy(address _user, uint256 _blockNumber) external view returns (uint256) {
        require(_blockNumber <= block.number, "bad _blockNumber");
        UserInfo memory user = userInfo[_user];
        if (user.cakePoolProxy != address(0)) {
            return _balanceOfAt(user.cakePoolProxy, _blockNumber);
        }
    }

    /// @notice Return the balance of VECake at a given "_blockNumber"
    /// @param _user The address to get a balance of VECake
    /// @param _blockNumber The speicific block number that you want to check the balance of VECake
    function balanceOfAt(address _user, uint256 _blockNumber) external view returns (uint256) {
        require(_blockNumber <= block.number, "bad _blockNumber");
        UserInfo memory user = userInfo[_user];
        if (user.cakePoolProxy != address(0)) {
            return _balanceOfAt(_user, _blockNumber) + _balanceOfAt(user.cakePoolProxy, _blockNumber);
        } else {
            return _balanceOfAt(_user, _blockNumber);
        }
    }

    function balanceOfAtUser(address _user, uint256 _blockNumber) external view returns (uint256) {
        return _balanceOfAt(_user, _blockNumber);
    }

    function _balanceOfAt(address _user, uint256 _blockNumber) internal view returns (uint256) {
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

    /// @notice Return the voting weight of a givne user's proxy
    /// @param _user The address of a user
    function balanceOfForProxy(address _user) external view returns (uint256) {
        UserInfo memory user = userInfo[_user];
        if (user.cakePoolProxy != address(0)) {
            return _balanceOf(user.cakePoolProxy, block.timestamp);
        }
    }

    /// @notice Return the voting weight of a givne user
    /// @param _user The address of a user
    function balanceOf(address _user) external view returns (uint256) {
        UserInfo memory user = userInfo[_user];
        if (user.cakePoolProxy != address(0)) {
            return _balanceOf(_user, block.timestamp) + _balanceOf(user.cakePoolProxy, block.timestamp);
        } else {
            return _balanceOf(_user, block.timestamp);
        }
    }

    function balanceOfUser(address _user) external view returns (uint256) {
        return _balanceOf(_user, block.timestamp);
    }

    function balanceOfAtTime(address _user, uint256 _timestamp) external view returns (uint256) {
        return _balanceOf(_user, _timestamp);
    }

    function _balanceOf(address _user, uint256 _timestamp) internal view returns (uint256) {
        uint256 _epoch = userPointEpoch[_user];
        if (_epoch == 0) {
            return 0;
        }
        Point memory _lastPoint = userPointHistory[_user][_epoch];
        _lastPoint.bias =
            _lastPoint.bias -
            (_lastPoint.slope * SafeCast.toInt128(int256(_timestamp - _lastPoint.timestamp)));
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

    /// @notice Deposit in cake pool
    /// @param _user user address
    /// @param _amount: number of tokens to deposit (in CAKE)
    /// @param _lockDuration: Token lock duration
    function deposit(
        address _user,
        uint256 _amount,
        uint256 _lockDuration
    ) external onlyCakePool {
        // Do not allow any user to deposit cake in cake pool now after migration initialized.
        // will forbid any deposit operatioin
        // revert();

        // This is only for test , so users can lock in cake pool , then can migrate or delegate
        UserInfo memory user = userInfo[_user];
        if (user.cakePoolType > 0) {
            revert();
        }
    }

    /// @notice Withdraw in cake pool
    /// @param _user user address
    function withdraw(address _user) external onlyCakePool {
        UserInfo memory user = userInfo[_user];

        // Users who had already delegated can not withdraw cake from cake pool
        if (user.cakePoolType == DELEGATION_FROM_CAKE_POOL_FLAG) {
            revert();
        } else if (
            user.cakePoolProxy != address(0) &&
            user.cakePoolType == MIGRATION_FROM_CAKE_POOL_FLAG &&
            user.withdrawFlag == NOT_WITHDRAW_FLAG
        ) {
            IProxyForCakePool(user.cakePoolProxy).withdrawAll();
            userInfo[_user].withdrawFlag = WITHDREW_FLAG;
        }
    }

    /// @notice Migrate from cake pool.
    function migrateFromCakePool() external nonReentrant {
        require(initialization, "! initialized");

        (uint256 shares, , , , , uint256 lockEndTime, uint256 userBoostedShare, , ) = CakePool.userInfo(msg.sender);

        require(lockEndTime > block.timestamp, "Lock expired");

        UserInfo storage user = userInfo[msg.sender];
        require(user.cakePoolType == 0, "Already migrated");

        user.cakePoolType = MIGRATION_FROM_CAKE_POOL_FLAG;
        uint256 totalShares = CakePool.totalShares();
        uint256 balanceOfCakePool = CakePool.balanceOf();
        // Subtract 1 is for precision round loss
        uint256 lockedCakeAmount = (shares * balanceOfCakePool) / totalShares - userBoostedShare - 1;
        // will lock by proxy smart contract
        address proxy = ProxyForCakePoolFactory.deploy(msg.sender);
        isCakePoolProxy[proxy] = true;
        user.cakePoolProxy = proxy;
        user.migrationTime = uint48(block.timestamp);
        user.cakeAmount = uint128(lockedCakeAmount);
        user.lockEndTime = uint48(lockEndTime);

        IProxyForCakePool(proxy).createLockForProxy(lockedCakeAmount, lockEndTime);

        emit MigrateFromCakePool(msg.sender, proxy, lockedCakeAmount, lockEndTime);
    }

    /// @notice Delegate from cake pool.
    /// @dev this function will call one function in delegator smart contract, DelegatorSC.delegate(address user, uint256 amount, uint256 endTime).
    /// @param _delegator delegation address
    function delegateFromCakePool(address _delegator) external nonReentrant {
        require(initialization, "! initialized");

        Delegator storage delegatorInfo = delegator[_delegator];
        require(delegatorInfo.isDelegator == DELEGATOR_FLAG, "! delegator");

        (uint256 shares, , , , , uint256 lockEndTime, uint256 userBoostedShare, , ) = CakePool.userInfo(msg.sender);

        require(lockEndTime > block.timestamp, "Lock expired");

        UserInfo storage user = userInfo[msg.sender];
        require(user.cakePoolType == 0, "Already migrated");

        user.cakePoolType = DELEGATION_FROM_CAKE_POOL_FLAG;

        uint256 totalShares = CakePool.totalShares();
        uint256 balanceOfCakePool = CakePool.balanceOf();
        // Subtract 1 is for precision round loss
        uint256 lockedCakeAmount = (shares * balanceOfCakePool) / totalShares - userBoostedShare - 1;

        user.lockEndTime = uint48(lockEndTime);
        user.cakeAmount = uint128(lockedCakeAmount);

        // Increase amount for delegator
        LockedBalance memory _lock = LockedBalance({amount: locks[_delegator].amount, end: locks[_delegator].end});
        require(lockedCakeAmount > 0, "Bad _amount");
        require(_lock.amount > 0, "No lock on delegator");
        require(_lock.end > block.timestamp, "Delegator lock expired");

        _depositFor(_delegator, lockedCakeAmount, 0, _lock, ACTION_DEPOSIT_FOR, true);

        delegatorInfo.delegatedCakeAmount += uint104(lockedCakeAmount);
        delegatorInfo.notInjectedCakeAmount += uint104(lockedCakeAmount);

        // Call delegate in delegator smart contract
        IDelegator(_delegator).delegate(msg.sender, lockedCakeAmount, lockEndTime);
        emit DelegateFromCakePool(msg.sender, _delegator, lockedCakeAmount, lockEndTime);
    }

    /// @notice Migration convert to delegation.
    /// @dev Migration users can delegate within a certain period after migrated.
    /// @param _delegator delegation address
    function migrationConvertToDelegation(address _delegator) external nonReentrant {
        Delegator storage delegatorInfo = delegator[_delegator];
        require(delegatorInfo.isDelegator == DELEGATOR_FLAG, "! delegator");

        UserInfo storage user = userInfo[msg.sender];
        uint256 _unlockTime = _timestampToFloorWeek(user.lockEndTime);
        require(_unlockTime > block.timestamp, "User lock expired");
        require(user.migrationTime > block.timestamp - limitTimeOfConvert, "Too late");
        require(user.cakePoolType == MIGRATION_FROM_CAKE_POOL_FLAG, "! migrated");
        require(user.withdrawFlag == NOT_WITHDRAW_FLAG, "Already withdraw");

        user.cakePoolType = DELEGATION_FROM_CAKE_POOL_FLAG;

        // Early withdraw all for proxy
        LockedBalance memory lockOfProxy = locks[user.cakePoolProxy];
        uint256 _amount = SafeCast.toUint256(lockOfProxy.amount);
        _unlock(user.cakePoolProxy, lockOfProxy, _amount);

        // Increase amount for delegator
        LockedBalance memory _lock = LockedBalance({amount: locks[_delegator].amount, end: locks[_delegator].end});

        require(_lock.amount > 0, "No lock on delegator");
        require(_lock.end > block.timestamp, "Delegator lock expired");

        _depositFor(_delegator, user.cakeAmount, 0, _lock, ACTION_DEPOSIT_FOR, true);

        delegatorInfo.delegatedCakeAmount += uint104(user.cakeAmount);
        delegatorInfo.notInjectedCakeAmount += uint104(user.cakeAmount);

        // Call delegate in delegator smart contract
        IDelegator(_delegator).delegate(msg.sender, user.cakeAmount, user.lockEndTime);
        emit DelegateFromCakePool(msg.sender, _delegator, user.cakeAmount, user.lockEndTime);
        emit MigrationConvertToDelegation(msg.sender, _delegator, user.cakeAmount, user.lockEndTime);
    }

    /// @notice Create a new lock.
    /// @dev This will crate a new lock and deposit Cake to VECake Vault
    /// @param _amount the amount that user wishes to deposit
    /// @param _unlockTime the timestamp when Cake get unlocked, it will be
    /// floored down to whole weeks
    function createLock(uint256 _amount, uint256 _unlockTime) external onlyEOAorWhitelisted nonReentrant {
        _createLock(_amount, _unlockTime);
    }

    function createLockForProxy(uint256 _amount, uint256 _unlockTime) external {
        require(isCakePoolProxy[msg.sender], "! proxy");
        _createLock(_amount, _unlockTime);
    }

    function _createLock(uint256 _amount, uint256 _unlockTime) internal {
        require(!everEmergencyWithdraw[msg.sender], "Already emergencyWithdraw");
        _unlockTime = _timestampToFloorWeek(_unlockTime);
        LockedBalance memory _locked = locks[msg.sender];

        require(_amount > 0, "Bad _amount");
        require(_locked.amount == 0, "Already locked");
        require(_unlockTime > block.timestamp, "_unlockTime too old");
        require(_unlockTime <= block.timestamp + MAX_LOCK, "_unlockTime too long");

        _depositFor(msg.sender, _amount, _unlockTime, _locked, ACTION_CREATE_LOCK, isCakePoolProxy[msg.sender]);
    }

    /// @notice Deposit `_amount` tokens for `_for` and add to `locks[_for]`
    /// @dev This function is used for deposit to created lock. Not for extend locktime.
    /// @param _for The address to do the deposit
    /// @param _amount The amount that user wishes to deposit
    function depositFor(address _for, uint256 _amount) external nonReentrant {
        require(!isCakePoolProxy[_for], "Incorrect proxy");
        LockedBalance memory _lock = LockedBalance({amount: locks[_for].amount, end: locks[_for].end});

        require(_amount > 0, "Bad _amount");
        require(_lock.amount > 0, "No lock found");
        require(_lock.end > block.timestamp, "Lock expired");

        _depositFor(_for, _amount, 0, _lock, ACTION_DEPOSIT_FOR, false);
    }

    /// @notice Internal function to perform deposit and lock Cake for a user
    /// @param _for The address to be locked and received VECake
    /// @param _amount The amount to deposit
    /// @param _unlockTime New time to unlock Cake. Pass 0 if no change.
    /// @param _prevLocked Existed locks[_for]
    /// @param _actionType The action that user did as this internal function shared among
    /// @param _isCakePoolUser This user is cake pool user or not
    /// several external functions
    function _depositFor(
        address _for,
        uint256 _amount,
        uint256 _unlockTime,
        LockedBalance memory _prevLocked,
        uint256 _actionType,
        bool _isCakePoolUser
    ) internal {
        // Initiate _supplyBefore & update supply
        uint256 _supplyBefore = supply;
        supply = _supplyBefore + _amount;

        // Store _prevLocked
        LockedBalance memory _newLocked = LockedBalance({amount: _prevLocked.amount, end: _prevLocked.end});

        // Adding new lock to existing lock, or if lock is expired
        // - creating a new one
        _newLocked.amount = _newLocked.amount + SafeCast.toInt128(int256(_amount));
        if (_unlockTime != 0) {
            _newLocked.end = _unlockTime;
        }
        locks[_for] = _newLocked;

        // Handling checkpoint here
        _checkpoint(_for, _prevLocked, _newLocked);

        // Cake pool user do not need to transfer cake
        if (_amount != 0 && !_isCakePoolUser) {
            token.safeTransferFrom(msg.sender, address(this), _amount);
        }

        if (address(FarmBooster) != address(0)) {
            FarmBooster.depositFor(
                _for,
                _amount,
                _unlockTime,
                _prevLocked.amount,
                _prevLocked.end,
                _actionType,
                _isCakePoolUser
            );
        }

        emit Deposit(_for, _amount, _newLocked.end, _actionType, block.timestamp);
        emit Supply(_supplyBefore, supply);
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

    /// @notice Increase lock amount without increase "end"
    /// @param _amount The amount of Cake to be added to the lock
    function increaseLockAmount(uint256 _amount) external onlyEOAorWhitelisted nonReentrant {
        LockedBalance memory _lock = LockedBalance({amount: locks[msg.sender].amount, end: locks[msg.sender].end});

        require(_amount > 0, "Bad _amount");
        require(_lock.amount > 0, "No lock found");
        require(_lock.end > block.timestamp, "Lock expired");

        _depositFor(msg.sender, _amount, 0, _lock, ACTION_INCREASE_LOCK_AMOUNT, false);
    }

    /// @notice Increase unlock time without changing locked amount
    /// @param _newUnlockTime The new unlock time to be updated
    function increaseUnlockTime(uint256 _newUnlockTime) external onlyEOAorWhitelisted nonReentrant {
        LockedBalance memory _lock = LockedBalance({amount: locks[msg.sender].amount, end: locks[msg.sender].end});
        _newUnlockTime = _timestampToFloorWeek(_newUnlockTime);

        require(_lock.amount > 0, "No lock found");
        require(_lock.end > block.timestamp, "Lock expired");
        require(_newUnlockTime > _lock.end, "_newUnlockTime too old");
        require(_newUnlockTime <= block.timestamp + MAX_LOCK, "_newUnlockTime too long");

        _depositFor(msg.sender, 0, _newUnlockTime, _lock, ACTION_INCREASE_UNLOCK_TIME, false);
    }

    /// @notice Round off random timestamp to week
    /// @param _timestamp The timestamp to be rounded off
    function _timestampToFloorWeek(uint256 _timestamp) internal pure returns (uint256) {
        return (_timestamp / WEEK) * WEEK;
    }

    /// @notice Calculate total supply of VECake (voting power)
    function totalSupply() external view returns (uint256) {
        return _totalSupplyAt(pointHistory[epoch], block.timestamp);
    }

    /// @notice Calculate total supply of VECake (voting power) at at specific timestamp
    /// @param _timestamp The specific timestamp to calculate totalSupply
    function totalSupplyAtTime(uint256 _timestamp) external view returns (uint256) {
        return _totalSupplyAt(pointHistory[epoch], _timestamp);
    }

    /// @notice Calculate total supply of VECake at specific block
    /// @param _blockNumber The specific block number to calculate totalSupply
    function totalSupplyAt(uint256 _blockNumber) external view returns (uint256) {
        require(_blockNumber <= block.number, "Bad _blockNumber");
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

    /// @notice Calculate total supply of VECake (voting power) at some point in the past
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

    /// @notice Set breaker
    /// @param _breaker The new value of breaker 0 if off, 1 if on
    function setBreaker(uint256 _breaker) external onlyOwner {
        require(_breaker == 0 || _breaker == 1, "Only 0 or 1");
        uint256 _previousBreaker = breaker;
        breaker = _breaker;
        emit SetBreaker(_previousBreaker, breaker);
    }

    /// @notice Withdraw all Cake when lock has expired.
    /// @param _to The address which will receive the cake
    function withdrawAll(address _to) external nonReentrant {
        Delegator memory delegatorInfo = delegator[msg.sender];
        require(delegatorInfo.notInjectedCakeAmount == 0, "Insufficient injection for delegator");

        LockedBalance memory _lock = locks[msg.sender];
        if (breaker == 0) require(block.timestamp >= _lock.end, "Lock not expired");

        if (_to == address(0)) {
            _to = msg.sender;
        }

        uint256 _amount = SafeCast.toUint256(_lock.amount);

        _unlock(msg.sender, _lock, _amount);

        // Cake pool proxy do not need to transfer cake.
        if (!isCakePoolProxy[msg.sender]) token.safeTransfer(_to, _amount);

        emit WithdrawAll(msg.sender, _to, _amount, block.timestamp);
    }

    /// @notice Early withdraw Cake with penalty.
    /// @param _to The address which will receive the cake
    /// @param _amount Cake amount
    function earlyWithdraw(address _to, uint256 _amount) external nonReentrant {
        require(earlyWithdrawSwitch, "Forbid");

        if (_to == address(0)) {
            _to = msg.sender;
        }

        LockedBalance memory _lock = locks[msg.sender];

        require(_amount > 0, "Bad _amount");
        require(block.timestamp < _lock.end, "Too late");
        require(breaker == 0, "Forbid");

        Delegator memory delegatorInfo = delegator[msg.sender];
        if (delegatorInfo.isDelegator == DELEGATOR_FLAG) {
            require(delegatorInfo.limitTimestampForEarlyWithdraw < block.timestamp, "Forbid earlyWithdraw");
            uint256 lockedAmount = SafeCast.toUint256(_lock.amount);
            require(lockedAmount - _amount >= delegatorInfo.notInjectedCakeAmount, "Delegator balance exceeded");
        }

        // prevent mutated memory in _unlock() function as it will be used in fee calculation afterward
        uint256 _prevLockEnd = _lock.end;
        _unlock(msg.sender, _lock, _amount);

        uint256 _penalty;

        if (!noPenaltyForEarlyWithdraw[msg.sender] && earlyWithdrawBpsPerWeek > 0) {
            // ceil the week by adding 1 week first
            uint256 remainingWeeks = (_prevLockEnd + WEEK - block.timestamp) / WEEK;

            // calculate penalty
            _penalty = (earlyWithdrawBpsPerWeek * remainingWeeks * _amount) / 10000;

            // split penalty into two parts
            uint256 _redistribute = (_penalty * redistributeBps) / 10000;
            // accumulate cake for redistribution
            accumRedistribute += _redistribute;

            // transfer one part of the penalty to treasury
            token.safeTransfer(treasuryAddr, _penalty - _redistribute);
        }

        // transfer remaining back to owner
        token.safeTransfer(_to, _amount - _penalty);

        emit EarlyWithdraw(msg.sender, _to, _amount, _penalty, block.timestamp);
    }

    /// @notice Emergency withdraw Cake.
    /// @dev Under any circumstances, it is guaranteed that the user’s assets will not be locked
    function emergencyWithdraw() external nonReentrant {
        require(emergencyWithdrawSwitch, "Forbid emergency withdraw");
        require(!everEmergencyWithdraw[msg.sender], "Already emergencyWithdraw");
        everEmergencyWithdraw[msg.sender] = true;

        LockedBalance memory _lock = locks[msg.sender];

        require(_lock.amount > 0, "No locked amount");

        uint256 amount = SafeCast.toUint256(_lock.amount);
        // clear user data
        delete locks[msg.sender];
        delete userPointHistory[msg.sender];
        delete userPointEpoch[msg.sender];

        // transfer remaining back to owner
        token.safeTransfer(msg.sender, amount);

        emit EmergencyWithdraw(msg.sender, amount);
    }

    function redistribute() external onlyRedistributors nonReentrant {
        uint256 _amount = accumRedistribute;

        accumRedistribute = 0;

        token.safeTransfer(redistributeAddr, _amount);

        emit Redistribute(msg.sender, redistributeAddr, _amount);
    }

    function _unlock(
        address _user,
        LockedBalance memory _lock,
        uint256 _withdrawAmount
    ) internal {
        // Cast here for readability
        uint256 _lockedAmount = SafeCast.toUint256(_lock.amount);
        require(_withdrawAmount <= _lockedAmount, "Amount too large");

        LockedBalance memory _prevLock = LockedBalance({end: _lock.end, amount: _lock.amount});
        //_lock.end should remain the same if we do partially withdraw
        _lock.end = _lockedAmount == _withdrawAmount ? 0 : _lock.end;
        _lock.amount = SafeCast.toInt128(int256(_lockedAmount - _withdrawAmount));
        locks[_user] = _lock;

        uint256 _supplyBefore = supply;
        supply = _supplyBefore - _withdrawAmount;

        // _prevLock can have either block.timstamp >= _lock.end or zero end
        // _lock has only 0 end
        // Both can have >= 0 amount
        _checkpoint(_user, _prevLock, _lock);

        if (address(FarmBooster) != address(0)) {
            FarmBooster.unlock(_user, _prevLock.amount, _prevLock.end, _withdrawAmount);
        }
        emit Supply(_supplyBefore, supply);
    }

    function setEarlyWithdrawConfig(
        uint64 _newEarlyWithdrawBpsPerWeek,
        uint64 _newRedistributeBps,
        address _newTreasuryAddr,
        address _newRedistributeAddr
    ) external onlyOwner {
        // Maximum early withdraw fee per week bps = 100% / 52 week = 1.923%)
        require(_newEarlyWithdrawBpsPerWeek <= 192, "Fee too high");
        // Maximum redistributeBps = 10000 (100%)
        require(_newRedistributeBps <= 10000, "bps too high");

        uint64 _oldEarlyWithdrawBpsPerWeek = earlyWithdrawBpsPerWeek;
        earlyWithdrawBpsPerWeek = _newEarlyWithdrawBpsPerWeek;

        uint64 _oldRedistributeBps = redistributeBps;
        redistributeBps = _newRedistributeBps;

        address _oldTreasuryAddr = treasuryAddr;
        treasuryAddr = _newTreasuryAddr;
        address _oldRedistributeAddr = redistributeAddr;
        redistributeAddr = _newRedistributeAddr;

        emit SetEarlyWithdrawConfig(
            msg.sender,
            _oldEarlyWithdrawBpsPerWeek,
            _newEarlyWithdrawBpsPerWeek,
            _oldRedistributeBps,
            _newRedistributeBps,
            _oldTreasuryAddr,
            _newTreasuryAddr,
            _oldRedistributeAddr,
            _newRedistributeAddr
        );
    }

    function setWhitelistedCallers(address[] calldata callers, bool ok) external onlyOwner {
        for (uint256 idx = 0; idx < callers.length; idx++) {
            whitelistedCallers[callers[idx]] = ok;
            emit SetWhitelistedCaller(_msgSender(), callers[idx], ok);
        }
    }

    function setWhitelistedRedistributors(address[] calldata callers, bool ok) external onlyOwner {
        for (uint256 idx = 0; idx < callers.length; idx++) {
            whitelistedRedistributors[callers[idx]] = ok;
            emit SetWhitelistedRedistributors(_msgSender(), callers[idx], ok);
        }
    }

    /// @notice Update delegator
    /// @param _delegator The delegator address
    /// @param _isDelegator Is delegator or not
    /// @param _limitTimestampForEarlyWithdraw Delegator can not call earlyWithdraw before limit time.
    function updateDelegator(
        address _delegator,
        bool _isDelegator,
        uint40 _limitTimestampForEarlyWithdraw
    ) external onlyOwner {
        Delegator storage delegatorInfo = delegator[_delegator];
        delegatorInfo.isDelegator = _isDelegator ? DELEGATOR_FLAG : NOT_DELEGATOR_FLAG;
        delegatorInfo.limitTimestampForEarlyWithdraw = _limitTimestampForEarlyWithdraw;
        emit UpdateDelegator(_delegator, _isDelegator, _limitTimestampForEarlyWithdraw);
    }

    /// @notice Set limitTimeOfConvert
    /// @param _limitTime The limit time
    function setLimitTimeOfConvert(uint256 _limitTime) external onlyOwner {
        limitTimeOfConvert = _limitTime;
        emit SetLimitTimeOfConvert(msg.sender, _limitTime);
    }

    /// @notice Set ealy withdraw switch
    /// @param _earlyWithdrawSwitch early withdraw switch
    function setEarlyWithdrawSwitch(bool _earlyWithdrawSwitch) external onlyOwner {
        earlyWithdrawSwitch = _earlyWithdrawSwitch;
        emit SetEarlyWithdrawSwitch(msg.sender, _earlyWithdrawSwitch);
    }

    /// @notice Set emergency withdraw switch
    /// @param _emergencyWithdrawSwitch early withdraw switch
    function setEmergencyWithdrawSwitch(bool _emergencyWithdrawSwitch) external onlyOwner {
        emergencyWithdrawSwitch = _emergencyWithdrawSwitch;
        emit SetEmergencyWithdrawSwitch(msg.sender, _emergencyWithdrawSwitch);
    }

    /// @notice Set no penalty early withdraw user
    /// @param _user no penalty early withdraw user
    /// @param _status no penalty or not
    function setNoPenaltyForEarlyWithdraw(address _user, bool _status) external onlyOwner {
        noPenaltyForEarlyWithdraw[_user] = _status;
        emit SetNoPenaltyForEarlyWithdraw(msg.sender, _user, _status);
    }

    /// @notice Inject cake for delegator
    /// @param _delegator The delegator address
    /// @param _amount Cake amount
    function injectToDelegator(address _delegator, uint256 _amount) external onlyOwner {
        Delegator storage delegatorInfo = delegator[_delegator];
        require(delegatorInfo.isDelegator == DELEGATOR_FLAG, "! delegator");
        if (_amount > delegatorInfo.notInjectedCakeAmount) {
            _amount = delegatorInfo.notInjectedCakeAmount;
        }
        delegatorInfo.notInjectedCakeAmount -= uint104(_amount);
        token.safeTransferFrom(msg.sender, address(this), _amount);
        emit InjectToDelegator(msg.sender, _delegator, _amount);
    }

    /// @notice Set farm booster Contract address
    /// @param _farmBooster The farm booster Contract address
    function setFarmBooster(address _farmBooster) external onlyOwner {
        require(_farmBooster != address(0), "Cannot be zero address");
        FarmBooster = IFarmBooster(_farmBooster);
        emit NewFarmBooster(_farmBooster);
    }
}
