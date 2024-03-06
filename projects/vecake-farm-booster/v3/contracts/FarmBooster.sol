// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin-4.5.0/contracts/access/Ownable.sol";
import "@openzeppelin-4.5.0/contracts/token/ERC20/IERC20.sol";
import "./libraries/IterateMapping.sol";
import "./interfaces/IVECake.sol";
import "./interfaces/IMasterChefV3.sol";
import "./interfaces/IPancakeV3Pool.sol";
import "./interfaces/INonfungiblePositionManager.sol";
import "./interfaces/IPancakeV3Factory.sol";

contract FarmBooster is Ownable {
    using IterableMapping for ItMap;

    /// @notice VECake.
    address public immutable VECake;
    /// @notice VECake caller, this smart contract will trigger depositFor and unlock.
    address public VECakeCaller;
    /// @notice MasterChef V3 contract.
    IMasterChefV3 public immutable MASTER_CHEF_V3;

    /// @notice NonfungiblePositionManager contract.
    INonfungiblePositionManager public immutable NonfungiblePositionManager;

    /// @notice PancakeV3Factory contract.
    IPancakeV3Factory public immutable PancakeV3Factory;

    /// @notice Record user token position liquidity
    /// @dev Only record the positions which have updated after fram booster set in MasterChef V3.
    mapping(address => mapping(uint256 => uint256)) public userPositionLiquidity;

    /// @notice Record user total liquidity in MasterChef V3 pool
    mapping(address => mapping(uint256 => uint256)) public userPoolTotalLiquidity;

    /// @notice limit max boost
    uint256 public cA;
    /// @notice include 1e4
    uint256 public constant MIN_CA = 1e4;
    /// @notice include 1e5
    uint256 public constant MAX_CA = 1e5;
    /// @notice cA precision
    uint256 public constant CA_PRECISION = 1e5;
    /// @notice controls difficulties
    uint256 public cB;
    /// @notice not include 0
    uint256 public constant MIN_CB = 0;
    /// @notice include 50
    uint256 public constant MAX_CB = 1e8;
    /// @notice cB precision
    uint256 public constant CB_PRECISION = 1e4;
    /// @notice MCV3 basic boost factor, none boosted user"s boost factor
    uint256 public constant BOOST_PRECISION = 100 * 1e10;
    /// @notice MCV3 Hard limit for maximum boost factor
    uint256 public constant MAX_BOOST_PRECISION = 200 * 1e10;

    /// @notice Override global cB for special pool pid.
    mapping(uint256 => uint256) public cBOverride;

    /// @notice The whitelist of pools allowed for farm boosting.
    mapping(uint256 => bool) public whiteList;

    /// @notice Record whether the farm booster has been turned on, in order to save gas.
    mapping(uint256 => bool) public everBoosted;

    /// @notice Info of each pool user.
    mapping(address => ItMap) public userInfo;

    event UpdateCA(uint256 oldCA, uint256 newCA);
    event UpdateCB(uint256 oldCB, uint256 newCB);
    event UpdateCBOverride(uint256 pid, uint256 oldCB, uint256 newCB);
    event UpdateBoostFarms(uint256 pid, bool status);
    event UpdatePoolBoostMultiplier(
        address indexed user,
        uint256 indexed pid,
        uint256 indexed tokenId,
        uint256 oldMultiplier,
        uint256 newMultiplier
    );
    event UpdateVECakeCaller(address VECakeCaller);

    /// @param _VECake VECake contract address.
    /// @param _v3 MasterChefV3 contract address.
    /// @param _cA Limit max boost.
    /// @param _cB Controls difficulties.
    constructor(
        address _VECake,
        IMasterChefV3 _v3,
        uint256 _cA,
        uint256 _cB
    ) {
        require(_cA >= MIN_CA && _cA <= MAX_CA && _cB > MIN_CB && _cB <= MAX_CB, "Invalid parameter");
        VECake = _VECake;
        MASTER_CHEF_V3 = _v3;
        cA = _cA;
        cB = _cB;

        NonfungiblePositionManager = INonfungiblePositionManager(MASTER_CHEF_V3.nonfungiblePositionManager());

        PancakeV3Factory = IPancakeV3Factory(NonfungiblePositionManager.factory());
    }

    /// @notice Checks if the msg.sender is the MasterChef V3.
    modifier onlyMasterChefV3() {
        require(msg.sender == address(MASTER_CHEF_V3), "Not MasterChef V3");
        _;
    }

    /// @notice Checks if the msg.sender is the vecake caller.
    modifier onlyVECakeCaller() {
        require(msg.sender == VECakeCaller, "Not vecake caller");
        _;
    }

    /// @notice set VECake caller.
    /// @param _VECakeCaller VECake caller.
    function setVECakeCaller(address _VECakeCaller) external onlyOwner {
        VECakeCaller = _VECakeCaller;
        emit UpdateVECakeCaller(_VECakeCaller);
    }

    struct BoosterFarmConfig {
        uint256 pid;
        bool status;
    }

    /// @notice Only allow whitelisted pids for farm boosting.
    /// @param _boosterFarms Booster farms config
    function setBoosterFarms(BoosterFarmConfig[] calldata _boosterFarms) external onlyOwner {
        for (uint256 i = 0; i < _boosterFarms.length; i++) {
            BoosterFarmConfig memory farm = _boosterFarms[i];
            if (farm.status && !everBoosted[farm.pid]) everBoosted[farm.pid] = true;
            whiteList[farm.pid] = farm.status;
            emit UpdateBoostFarms(farm.pid, farm.status);
        }
    }

    /// @notice Limit max boost.
    /// @param _cA Max boost.
    function setCA(uint256 _cA) external onlyOwner {
        require(_cA >= MIN_CA && _cA <= MAX_CA, "Invalid cA");
        uint256 temp = cA;
        cA = _cA;
        emit UpdateCA(temp, cA);
    }

    /// @notice Controls difficulties.
    /// @param _cB Difficulties.
    function setCB(uint256 _cB) external onlyOwner {
        require(_cB > MIN_CB && _cB <= MAX_CB, "Invalid cB");
        uint256 temp = cB;
        cB = _cB;
        emit UpdateCB(temp, cB);
    }

    /// @notice Set cBOverride.
    /// @param _pid Pool pid.
    /// @param _cB Difficulties.
    function setCBOverride(uint256 _pid, uint256 _cB) external onlyOwner {
        // Can set cBOverride[pid] 0 when need to remove override value.
        require((_cB > MIN_CB && _cB <= MAX_CB) || _cB == 0, "Invalid cB");
        uint256 temp = cB;
        cBOverride[_pid] = _cB;
        emit UpdateCBOverride(_pid, temp, cB);
    }

    /// @notice Update user pool liquidity.
    /// @dev This will update the user total liquidity in pool.
    /// @param _user User address.
    /// @param _tokenId token id.
    /// @param _pid pool id.
    /// @param _liquidity token liquidity.
    function updateUserPoolLiquidity(
        address _user,
        uint256 _tokenId,
        uint256 _pid,
        uint256 _liquidity
    ) internal {
        // update total liquidity in this pool
        userPoolTotalLiquidity[_user][_pid] =
            userPoolTotalLiquidity[_user][_pid] -
            userPositionLiquidity[_user][_tokenId] +
            _liquidity;
        userPositionLiquidity[_user][_tokenId] = _liquidity;
    }

    /// @notice Update user boost multiplier, only for MasterChef V3.
    /// @param _tokenId Token Id of position NFT.
    function updatePositionBoostMultiplier(uint256 _tokenId) external onlyMasterChefV3 returns (uint256 _multiplier) {
        (
            uint128 liquidity,
            uint128 boostLiquidity,
            ,
            ,
            ,
            ,
            address user,
            uint256 pid,
            uint256 boostMultiplier
        ) = MASTER_CHEF_V3.userPositionInfos(_tokenId);
        // Do not allow user to increase liquidity after removed all liquidity in MasterChef V3.
        if (boostLiquidity == 0 && boostMultiplier > 0) {
            revert();
        }
        // Set default multiplier
        _multiplier = BOOST_PRECISION;
        // In order to save gas, no need to check the farms which have never been boosted.
        if (everBoosted[pid]) {
            updateUserPoolLiquidity(user, _tokenId, pid, liquidity);

            ItMap storage itmap = userInfo[user];
            uint256 prevMultiplier = itmap.data[_tokenId];

            if (!whiteList[pid]) {
                if (itmap.contains(_tokenId)) {
                    itmap.remove(_tokenId);
                }
            } else {
                _multiplier = _boostCalculate(user, pid, userPoolTotalLiquidity[user][pid], 0, true);
                itmap.insert(_tokenId, _multiplier);
            }
            emit UpdatePoolBoostMultiplier(user, pid, _tokenId, prevMultiplier, _multiplier);
        }
    }

    /// @notice Remove user boost multiplier when user withdraw or burn in MasterChef V3.
    /// @param _user User address.
    /// @param _tokenId Token Id of position NFT.
    /// @param _pid Id of MasterChef V3 farm pool.
    function removeBoostMultiplier(
        address _user,
        uint256 _tokenId,
        uint256 _pid
    ) external onlyMasterChefV3 {
        // In order to save gas, no need to check the farms which have never been boosted.
        if (everBoosted[_pid]) {
            updateUserPoolLiquidity(_user, _tokenId, _pid, 0);

            ItMap storage itmap = userInfo[_user];
            if (itmap.contains(_tokenId)) {
                itmap.remove(_tokenId);
            }
        }
    }

    /// @notice VECake operation(deposit/withdraw) automatically call this function.
    /// @param _for User address.
    /// @param _amount The amount to deposit
    /// @param _unlockTime New time to unlock Cake. Pass 0 if no change.
    /// @param _prevLockedAmount Existed locks[_for].amount
    /// @param _prevLockedEnd Existed locks[_for].end
    /// @param _actionType The action that user did as this internal function shared among
    /// @param _isCakePoolUser This user is cake pool user or not
    function depositFor(
        address _for,
        uint256 _amount,
        uint256 _unlockTime,
        int128 _prevLockedAmount,
        uint256 _prevLockedEnd,
        uint256 _actionType,
        bool _isCakePoolUser
    ) external onlyVECakeCaller {
        _updateUserAllBoostMultiplier(_for);
    }

    /// @notice Function to perform withdraw and unlock Cake for a user
    /// @param _user The address to be unlocked
    /// @param _prevLockedAmount Existed locks[_user].amount
    /// @param _prevLockedEnd Existed locks[_user].end
    /// @param _withdrawAmount Cake amount
    function unlock(
        address _user,
        int128 _prevLockedAmount,
        uint256 _prevLockedEnd,
        uint256 _withdrawAmount
    ) external onlyVECakeCaller {
        _updateUserAllBoostMultiplier(_user);
    }

    function _updateUserAllBoostMultiplier(address _user) internal {
        ItMap storage itmap = userInfo[_user];
        uint256 length = itmap.keys.length;
        if (length > 0) {
            for (uint256 i = 0; i < length; i++) {
                uint256 tokenId = itmap.keys[i];
                (, address user, uint256 pid, ) = getUserPositionInfo(tokenId);
                if (_user == user) _updateBoostMultiplier(itmap, user, pid, tokenId);
            }
        }
    }

    /// @param _user user address.
    /// @param _pid pool id.
    /// @param _tokenId token id.
    function _updateBoostMultiplier(
        ItMap storage itmap,
        address _user,
        uint256 _pid,
        uint256 _tokenId
    ) internal {
        // Used to be boosted farm pool and current is not, remove from mapping
        if (!whiteList[_pid]) {
            if (itmap.data[_tokenId] > BOOST_PRECISION) {
                // reset to BOOST_PRECISION
                MASTER_CHEF_V3.updateBoostMultiplier(_tokenId, BOOST_PRECISION);
            }
            itmap.remove(_tokenId);
            return;
        }

        (, , , uint256 prevMultiplier) = getUserPositionInfo(_tokenId);
        uint256 multiplier = _boostCalculate(_user, _pid, userPoolTotalLiquidity[_user][_pid], 0, true);

        if (multiplier < BOOST_PRECISION) {
            multiplier = BOOST_PRECISION;
        } else if (multiplier > MAX_BOOST_PRECISION) {
            multiplier = MAX_BOOST_PRECISION;
        }

        // Update multiplier to MCV3
        if (multiplier != prevMultiplier) {
            MASTER_CHEF_V3.updateBoostMultiplier(_tokenId, multiplier);
        }
        itmap.insert(_tokenId, multiplier);

        emit UpdatePoolBoostMultiplier(_user, _pid, _tokenId, prevMultiplier, multiplier);
    }

    /// @notice Whether position boosted specific farm pool.
    /// @param _tokenId Token Id of position NFT.
    function isBoostedPool(uint256 _tokenId) external view returns (bool, uint256) {
        (, address user, uint256 pid, ) = getUserPositionInfo(_tokenId);
        return (userInfo[user].contains(_tokenId), pid);
    }

    /// @notice Actived position list.
    /// @param _user user address.
    function activedPositions(address _user) external view returns (uint256[] memory positions) {
        ItMap storage itmap = userInfo[_user];
        if (itmap.keys.length == 0) return positions;

        positions = new uint256[](itmap.keys.length);
        // solidity for-loop not support multiple variables initialized by "," separate.
        for (uint256 index = 0; index < itmap.keys.length; index++) {
            positions[index] = itmap.keys[index];
        }
    }

    function getUserPositionInfo(uint256 _tokenId)
        internal
        view
        returns (
            uint128 liquidity,
            address user,
            uint256 pid,
            uint256 boostMultiplier
        )
    {
        (liquidity, , , , , , user, pid, boostMultiplier) = MASTER_CHEF_V3.userPositionInfos(_tokenId);
    }

    /// @notice Anyone can call this function, if you find some guys effected multiplier is not fair
    /// for other users, just call "updateLiquidity" function in MasterChef V3.
    /// @param _tokenId Token Id of position NFT.
    /// @dev If return value not in range [BOOST_PRECISION, MAX_BOOST_PRECISION]
    /// the actual effected multiplier will be the close to side boundry value.
    function getUserMultiplier(uint256 _tokenId) external view returns (uint256) {
        (uint256 liquidity, address user, uint256 pid, ) = getUserPositionInfo(_tokenId);
        // Default is true
        bool isStaked = true;
        // positions did not stake in MasterChefV3 when pid is equal to 0.
        // Check positions in NonfungiblePositionManager
        if (pid == 0) {
            (
                ,
                ,
                address token0,
                address token1,
                uint24 fee,
                ,
                ,
                uint128 positionLiquidity,
                ,
                ,
                ,

            ) = NonfungiblePositionManager.positions(_tokenId);

            liquidity = uint256(positionLiquidity);
            user = NonfungiblePositionManager.ownerOf(_tokenId);
            address v3PoolAddress = PancakeV3Factory.getPool(token0, token1, fee);
            pid = MASTER_CHEF_V3.v3PoolAddressPid(v3PoolAddress);

            if (pid > 0) {
                isStaked = false;
            }
        }
        if (!whiteList[pid]) {
            return BOOST_PRECISION;
        } else {
            uint256 totalLiquidityInPool = userPoolTotalLiquidity[user][pid] -
                userPositionLiquidity[user][_tokenId] +
                liquidity;
            return _boostCalculate(user, pid, totalLiquidityInPool, liquidity, isStaked);
        }
    }

    /// @notice Get the total liquidity.
    /// @dev Will use the smaller value between MasterChefV3 pool totalLiquidity and V3 pool liquidity.
    /// @param _pid pool id(MasterchefV3 pool).
    /// @param _positionLiquidity Position liquidity of tokenId
    /// @param _isStaked The position had staked in MasterChefV3 or not
    function _getTotalLiquidity(
        uint256 _pid,
        uint256 _positionLiquidity,
        bool _isStaked
    ) internal view returns (uint256) {
        (, address v3Pool, , , , uint256 totalLiquidity, ) = MASTER_CHEF_V3.poolInfo(_pid);
        if (!_isStaked) {
            totalLiquidity += _positionLiquidity;
        }
        uint256 v3PoolLiquidity = IPancakeV3Pool(v3Pool).liquidity();
        if (totalLiquidity > v3PoolLiquidity) {
            totalLiquidity = v3PoolLiquidity;
        }
        return totalLiquidity;
    }

    /// @param _user user address.
    /// @param _pid pool id(MasterchefV3 pool).
    /// @param _userTotalLiquidity User total liquidity in MasterChef V3 pool
    /// @param _positionLiquidity Position liquidity of tokenId
    /// @param _isStaked The position had staked in MasterChefV3 or not
    function _boostCalculate(
        address _user,
        uint256 _pid,
        uint256 _userTotalLiquidity,
        uint256 _positionLiquidity,
        bool _isStaked
    ) internal view returns (uint256) {
        uint256 dB = (cA * _userTotalLiquidity) / CA_PRECISION;
        // dB == 0 means _liquidity close to 0
        if (dB == 0) return BOOST_PRECISION;

        uint256 totalLiquidity = _getTotalLiquidity(_pid, _positionLiquidity, _isStaked);

        // will use cBOverride[pid] If cBOverride[pid] is greater than 0 , or will use global cB.
        uint256 realCB = cBOverride[_pid] > 0 ? cBOverride[_pid] : cB;
        uint256 totalSupplyInVECake = IVECake(VECake).totalSupply();
        if (totalSupplyInVECake == 0) return BOOST_PRECISION;
        uint256 aB = (totalLiquidity * IVECake(VECake).balanceOf(_user) * realCB) / totalSupplyInVECake / CB_PRECISION;
        return ((_userTotalLiquidity <= (dB + aB) ? _userTotalLiquidity : (dB + aB)) * BOOST_PRECISION) / dB;
    }
}
