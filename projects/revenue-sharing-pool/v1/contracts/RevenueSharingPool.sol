// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin-4.5.0/contracts/access/Ownable.sol";
import "@openzeppelin-4.5.0/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin-4.5.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin-4.5.0/contracts/security/ReentrancyGuard.sol";
import "./libraries/SafeCast.sol";
import "./utils/Math128.sol";
import "./interfaces/IVCake.sol";
import "./interfaces/IRevenueSharingPoolFactory.sol";

contract RevenueSharingPool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Events
    event LogSetCanCheckpointToken(bool _toggleFlag);
    event LogFeed(uint256 _amount);
    event LogCheckpointToken(uint256 _timestamp, uint256 _tokens);
    event LogClaimed(address indexed _recipient, uint256 _amount, uint256 _claimEpoch, uint256 _maxEpoch);
    event LogKilled();
    event LogSetWhitelistedCheckpointCallers(address indexed _caller, address indexed _address, bool _ok);

    /// @dev Time-related constants
    uint256 public constant WEEK = 1 weeks;
    uint256 public constant TOKEN_CHECKPOINT_DEADLINE = 1 days;

    uint256 public startWeekCursor;
    uint256 public weekCursor;
    mapping(address => uint256) public weekCursorOf;
    mapping(address => uint256) public userEpochOf;

    uint256 public lastTokenTimestamp;
    mapping(uint256 => uint256) public tokensPerWeek;

    address public VCake;
    IERC20 public rewardToken;
    uint256 public lastTokenBalance;

    /// @dev VCake supply at week bounds
    mapping(uint256 => uint256) public totalSupplyAt;

    bool public canCheckpointToken;

    /// @dev address to get token when contract is emergency stop
    bool public isKilled;
    address public emergencyReturn;

    /// @dev list of whitelist checkpoint callers
    mapping(address => bool) public whitelistedCheckpointCallers;

    /// @notice constructor
    constructor() {
        (
            address _VCake,
            uint256 _startTime,
            address _rewardToken,
            address _emergencyReturn,
            address owner
        ) = IRevenueSharingPoolFactory(msg.sender).parameters();
        uint256 _startTimeFloorWeek = _timestampToFloorWeek(_startTime);
        startWeekCursor = _startTimeFloorWeek;
        lastTokenTimestamp = _startTimeFloorWeek;
        weekCursor = _startTimeFloorWeek;
        rewardToken = IERC20(_rewardToken);
        VCake = _VCake;
        emergencyReturn = _emergencyReturn;

        _transferOwnership(owner);
    }

    modifier onlyLive() {
        require(!isKilled, "killed");
        _;
    }

    /// @notice Get VCake balance of "_user" at "_timstamp"
    /// @param _user The user address
    /// @param _timestamp The timestamp to get user's balance
    function balanceOfAt(address _user, uint256 _timestamp) external view returns (uint256) {
        uint256 _maxUserEpoch = IVCake(VCake).userPointEpoch(_user);
        if (_maxUserEpoch == 0) {
            return 0;
        }

        uint256 _epoch = _findTimestampUserEpoch(_user, _timestamp, _maxUserEpoch);
        Point memory _point = IVCake(VCake).userPointHistory(_user, _epoch);
        int128 _bias = _point.bias - _point.slope * SafeCast.toInt128(int256(_timestamp - _point.timestamp));
        if (_bias < 0) {
            return 0;
        }
        return SafeCast.toUint256(_bias);
    }

    /// @notice Record token distribution checkpoint
    function _checkpointToken() internal {
        // Find out how many tokens to be distributed
        uint256 _rewardTokenBalance = rewardToken.balanceOf(address(this));
        uint256 _toDistribute = _rewardTokenBalance - lastTokenBalance;
        lastTokenBalance = _rewardTokenBalance;

        // Prepare and update time-related variables
        // 1. Setup _timeCursor to be the "lastTokenTimestamp"
        // 2. Find out how long from previous checkpoint
        // 3. Setup iterable cursor
        // 4. Update lastTokenTimestamp to be block.timestamp
        uint256 _timeCursor = lastTokenTimestamp;
        uint256 _deltaSinceLastTimestamp = block.timestamp - _timeCursor;
        uint256 _thisWeekCursor = _timestampToFloorWeek(_timeCursor);
        uint256 _nextWeekCursor = 0;
        lastTokenTimestamp = block.timestamp;

        // Iterate through weeks to filled out missing tokensPerWeek (if any)
        for (uint256 _i = 0; _i < 52; _i++) {
            _nextWeekCursor = _thisWeekCursor + WEEK;

            // if block.timestamp < _nextWeekCursor, means _nextWeekCursor goes
            // beyond the actual block.timestamp, hence it is the last iteration
            // to fill out tokensPerWeek
            if (block.timestamp < _nextWeekCursor) {
                if (_deltaSinceLastTimestamp == 0 && block.timestamp == _timeCursor) {
                    tokensPerWeek[_thisWeekCursor] = tokensPerWeek[_thisWeekCursor] + _toDistribute;
                } else {
                    tokensPerWeek[_thisWeekCursor] =
                        tokensPerWeek[_thisWeekCursor] +
                        ((_toDistribute * (block.timestamp - _timeCursor)) / _deltaSinceLastTimestamp);
                }
                break;
            } else {
                if (_deltaSinceLastTimestamp == 0 && _nextWeekCursor == _timeCursor) {
                    tokensPerWeek[_thisWeekCursor] = tokensPerWeek[_thisWeekCursor] + _toDistribute;
                } else {
                    tokensPerWeek[_thisWeekCursor] =
                        tokensPerWeek[_thisWeekCursor] +
                        ((_toDistribute * (_nextWeekCursor - _timeCursor)) / _deltaSinceLastTimestamp);
                }
            }
            _timeCursor = _nextWeekCursor;
            _thisWeekCursor = _nextWeekCursor;
        }

        emit LogCheckpointToken(block.timestamp, _toDistribute);
    }

    /// @notice Update token checkpoint
    /// @dev Calculate the total token to be distributed in a given week.
    /// At launch can only be called by owner, after launch can be called
    /// by anyone if block.timestamp > lastTokenTime + TOKEN_CHECKPOINT_DEADLINE
    function checkpointToken() external nonReentrant {
        require(
            msg.sender == owner() ||
                whitelistedCheckpointCallers[msg.sender] ||
                (canCheckpointToken && (block.timestamp > lastTokenTimestamp + TOKEN_CHECKPOINT_DEADLINE)),
            "!allow"
        );
        _checkpointToken();
    }

    /// @notice Record VCake total supply for each week
    function _checkpointTotalSupply() internal {
        uint256 _weekCursor = weekCursor;
        uint256 _roundedTimestamp = _timestampToFloorWeek(block.timestamp);

        IVCake(VCake).checkpoint();

        for (uint256 _i = 0; _i < 52; _i++) {
            if (_weekCursor > _roundedTimestamp) {
                break;
            } else {
                uint256 _epoch = _findTimestampEpoch(_weekCursor);
                Point memory _point = IVCake(VCake).pointHistory(_epoch);
                int128 _timeDelta = 0;
                if (_weekCursor > _point.timestamp) {
                    _timeDelta = SafeCast.toInt128(int256(_weekCursor - _point.timestamp));
                }
                int128 _bias = _point.bias - _point.slope * _timeDelta;
                if (_bias < 0) {
                    totalSupplyAt[_weekCursor] = 0;
                } else {
                    totalSupplyAt[_weekCursor] = SafeCast.toUint256(_bias);
                }
            }
            _weekCursor = _weekCursor + WEEK;
        }

        weekCursor = _weekCursor;
    }

    /// @notice Update VCake total supply checkpoint
    /// @dev This function can be called independently or at the first claim of
    /// the new epoch week.
    function checkpointTotalSupply() external nonReentrant {
        _checkpointTotalSupply();
    }

    /// @notice Claim rewardToken
    /// @dev Perform claim rewardToken
    function _claim(address _user, uint256 _maxClaimTimestamp) internal returns (uint256) {
        uint256 _userEpoch = 0;
        uint256 _toDistribute = 0;

        uint256 _maxUserEpoch = IVCake(VCake).userPointEpoch(_user);
        uint256 _startWeekCursor = startWeekCursor;

        // _maxUserEpoch = 0, meaning no lock.
        // Hence, no yield for _user
        if (_maxUserEpoch == 0) {
            return 0;
        }

        uint256 _userWeekCursor = weekCursorOf[_user];
        if (_userWeekCursor == 0) {
            // if _user has no _userWeekCursor with GrassHouse yet
            // then we need to perform binary search
            _userEpoch = _findTimestampUserEpoch(_user, _startWeekCursor, _maxUserEpoch);
        } else {
            // else, _user must has epoch with GrassHouse already
            _userEpoch = userEpochOf[_user];
        }

        if (_userEpoch == 0) {
            _userEpoch = 1;
        }

        Point memory _userPoint = IVCake(VCake).userPointHistory(_user, _userEpoch);

        if (_userWeekCursor == 0) {
            _userWeekCursor = ((_userPoint.timestamp + WEEK - 1) / WEEK) * WEEK;
        }

        // _userWeekCursor is already at/beyond _maxClaimTimestamp
        // meaning nothing to be claimed for this user.
        // This can be:
        // 1) User just lock their ALPACA less than 1 week
        // 2) User already claimed their rewards
        if (_userWeekCursor >= _maxClaimTimestamp) {
            return 0;
        }

        // Handle when user lock ALPACA before Grasshouse started
        // by assign _userWeekCursor to Grasshouse's _startWeekCursor
        if (_userWeekCursor < _startWeekCursor) {
            _userWeekCursor = _startWeekCursor;
        }

        Point memory _prevUserPoint = Point({bias: 0, slope: 0, timestamp: 0, blockNumber: 0});

        // Go through weeks
        for (uint256 _i = 0; _i < 52; _i++) {
            // If _userWeekCursor is iterated to be at/beyond _maxClaimTimestamp
            // This means we went through all weeks that user subject to claim rewards already
            if (_userWeekCursor >= _maxClaimTimestamp) {
                break;
            }
            // Move to the new epoch if need to,
            // else calculate rewards that user should get.
            if (_userWeekCursor >= _userPoint.timestamp && _userEpoch <= _maxUserEpoch) {
                _userEpoch = _userEpoch + 1;
                _prevUserPoint = Point({
                    bias: _userPoint.bias,
                    slope: _userPoint.slope,
                    timestamp: _userPoint.timestamp,
                    blockNumber: _userPoint.blockNumber
                });
                // When _userEpoch goes beyond _maxUserEpoch then there is no more Point,
                // else take _userEpoch as a new Point
                if (_userEpoch > _maxUserEpoch) {
                    _userPoint = Point({bias: 0, slope: 0, timestamp: 0, blockNumber: 0});
                } else {
                    _userPoint = IVCake(VCake).userPointHistory(_user, _userEpoch);
                }
            } else {
                int128 _timeDelta = SafeCast.toInt128(int256(_userWeekCursor - _prevUserPoint.timestamp));
                uint256 _balanceOf = SafeCast.toUint256(
                    Math128.max(_prevUserPoint.bias - _timeDelta * _prevUserPoint.slope, 0)
                );
                if (_balanceOf == 0 && _userEpoch > _maxUserEpoch) {
                    break;
                }
                if (_balanceOf > 0) {
                    _toDistribute =
                        _toDistribute +
                        (_balanceOf * tokensPerWeek[_userWeekCursor]) /
                        totalSupplyAt[_userWeekCursor];
                }
                _userWeekCursor = _userWeekCursor + WEEK;
            }
        }

        _userEpoch = Math128.min(_maxUserEpoch, _userEpoch - 1);
        userEpochOf[_user] = _userEpoch;
        weekCursorOf[_user] = _userWeekCursor;

        emit LogClaimed(_user, _toDistribute, _userEpoch, _maxUserEpoch);

        return _toDistribute;
    }

    /// @notice Claim rewardToken for "_user"
    /// @param _user The address to claim rewards for
    function claim(address _user) external nonReentrant onlyLive returns (uint256) {
        if (block.timestamp >= weekCursor) _checkpointTotalSupply();
        uint256 _lastTokenTimestamp = lastTokenTimestamp;

        if (canCheckpointToken && (block.timestamp > _lastTokenTimestamp + TOKEN_CHECKPOINT_DEADLINE)) {
            _checkpointToken();
            _lastTokenTimestamp = block.timestamp;
        }

        _lastTokenTimestamp = _timestampToFloorWeek(_lastTokenTimestamp);

        uint256 _amount = _claim(_user, _lastTokenTimestamp);
        if (_amount != 0) {
            lastTokenBalance = lastTokenBalance - _amount;
            rewardToken.safeTransfer(_user, _amount);
        }

        return _amount;
    }

    /// @notice Claim rewardToken for multiple users
    /// @param _users The array of addresses to claim reward for
    function claimMany(address[] calldata _users) external nonReentrant onlyLive returns (bool) {
        require(_users.length <= 20, "!over 20 users");

        if (block.timestamp >= weekCursor) _checkpointTotalSupply();

        uint256 _lastTokenTimestamp = lastTokenTimestamp;

        if (canCheckpointToken && (block.timestamp > _lastTokenTimestamp + TOKEN_CHECKPOINT_DEADLINE)) {
            _checkpointToken();
            _lastTokenTimestamp = block.timestamp;
        }

        _lastTokenTimestamp = _timestampToFloorWeek(_lastTokenTimestamp);
        uint256 _total = 0;

        for (uint256 i = 0; i < _users.length; i++) {
            require(_users[i] != address(0), "bad user");

            uint256 _amount = _claim(_users[i], _lastTokenTimestamp);
            if (_amount != 0) {
                rewardToken.safeTransfer(_users[i], _amount);
                _total = _total + _amount;
            }
        }

        if (_total != 0) {
            lastTokenBalance = lastTokenBalance - _total;
        }

        return true;
    }

    /// @notice Receive rewardTokens into the contract and trigger token checkpoint
    function feed(uint256 _amount) external nonReentrant onlyLive returns (bool) {
        rewardToken.safeTransferFrom(msg.sender, address(this), _amount);

        if (canCheckpointToken && (block.timestamp > lastTokenTimestamp + TOKEN_CHECKPOINT_DEADLINE)) {
            _checkpointToken();
        }

        emit LogFeed(_amount);

        return true;
    }

    /// @notice Do Binary Search to find out epoch from timestamp
    /// @param _timestamp Timestamp to find epoch
    function _findTimestampEpoch(uint256 _timestamp) internal view returns (uint256) {
        uint256 _min = 0;
        uint256 _max = IVCake(VCake).epoch();
        // Loop for 128 times -> enough for 128-bit numbers
        for (uint256 i = 0; i < 128; i++) {
            if (_min >= _max) {
                break;
            }
            uint256 _mid = (_min + _max + 1) / 2;
            Point memory _point = IVCake(VCake).pointHistory(_mid);
            if (_point.timestamp <= _timestamp) {
                _min = _mid;
            } else {
                _max = _mid - 1;
            }
        }
        return _min;
    }

    /// @notice Perform binary search to find out user's epoch from the given timestamp
    /// @param _user The user address
    /// @param _timestamp The timestamp that you wish to find out epoch
    /// @param _maxUserEpoch Max epoch to find out the timestamp
    function _findTimestampUserEpoch(
        address _user,
        uint256 _timestamp,
        uint256 _maxUserEpoch
    ) internal view returns (uint256) {
        uint256 _min = 0;
        uint256 _max = _maxUserEpoch;
        for (uint256 i = 0; i < 128; i++) {
            if (_min >= _max) {
                break;
            }
            uint256 _mid = (_min + _max + 1) / 2;
            Point memory _point = IVCake(VCake).userPointHistory(_user, _mid);
            if (_point.timestamp <= _timestamp) {
                _min = _mid;
            } else {
                _max = _mid - 1;
            }
        }
        return _min;
    }

    function kill() external onlyOwner {
        isKilled = true;
        rewardToken.safeTransfer(emergencyReturn, rewardToken.balanceOf(address(this)));

        emit LogKilled();
    }

    /// @notice Set canCheckpointToken to allow random callers to call checkpointToken
    /// @param _newCanCheckpointToken The new canCheckpointToken flag
    function setCanCheckpointToken(bool _newCanCheckpointToken) external onlyOwner {
        canCheckpointToken = _newCanCheckpointToken;
        emit LogSetCanCheckpointToken(_newCanCheckpointToken);
    }

    /// @notice Round off random timestamp to week
    /// @param _timestamp The timestamp to be rounded off
    function _timestampToFloorWeek(uint256 _timestamp) internal pure returns (uint256) {
        return (_timestamp / WEEK) * WEEK;
    }

    /// @notice Inject rewardToken into the contract
    /// @param _timestamp The timestamp of the rewardToken to be distributed
    /// @param _amount The amount of rewardToken to be distributed
    function injectReward(uint256 _timestamp, uint256 _amount) external onlyOwner {
        rewardToken.safeTransferFrom(msg.sender, address(this), _amount);
        lastTokenBalance += _amount;
        tokensPerWeek[_timestampToFloorWeek(_timestamp)] = _amount;
    }

    /// @notice Set whitelisted checkpoint callers.
    /// @dev Must only be called by owner.
    /// @param _callers addresses to be whitelisted.
    /// @param _ok The new ok flag for callers.
    function setWhitelistedCheckpointCallers(address[] calldata _callers, bool _ok) external onlyOwner {
        for (uint256 _idx = 0; _idx < _callers.length; _idx++) {
            whitelistedCheckpointCallers[_callers[_idx]] = _ok;
            emit LogSetWhitelistedCheckpointCallers(msg.sender, _callers[_idx], _ok);
        }
    }
}
