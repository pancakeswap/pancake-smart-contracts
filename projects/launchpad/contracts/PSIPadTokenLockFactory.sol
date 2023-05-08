// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "./interfaces/IPSIPadTokenLockFactory.sol";
import "./interfaces/IFeeAggregator.sol";
import "./interfaces/token/IWETH.sol";

contract PSIPadTokenLockFactory is IPSIPadTokenLockFactory, Initializable, OwnableUpgradeable {
    using AddressUpgradeable for address;
    using SafeMath for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public override fee_aggregator;
    address public override wrapped_coin; // WETH or WBNB
    uint256 public override wrapped_coin_fee; // fixed amount in bnb

    /**
     * @notice All tokens locked
     */
    LockingData[] public tokensLocked;

    /**
     * @notice Locks mapped on user's wallet address
     */
    mapping(address => uint256[]) public userTokensLocked;

    /**
     * @notice Locks mapped on user's wallet address
     */
    mapping(address => uint256[]) public tokenToLocks;

    modifier onlyLockOwner(uint256 lockId) {
        require(tokensLocked.length > lockId, "PSIPadTokenLockFactory: LOCK_DOES_NOT_EXIST");
        require(tokensLocked[lockId].owner == msg.sender, "PSIPadTokenLockFactory: UNAUTHORIZED");
        _;
    }

    /**
     * @notice Initialize a new token lock factory
     */
    function initialize(
        address _fee_aggregator,
        address _wrapped_coin,
        uint256 _wrapped_coin_fee
    ) external initializer {
        super.__Ownable_init();
        fee_aggregator = _fee_aggregator;
        wrapped_coin = _wrapped_coin;
        wrapped_coin_fee = _wrapped_coin_fee;
    }

    function getTokensLockedCount() external view override returns (uint256) {
        return tokensLocked.length;
    }

    function setFeeAggregator(address _fee_aggregator) external override onlyOwner {
        fee_aggregator = _fee_aggregator;
    }

    function setWrappedCoin(address _wrapped_coin) external override onlyOwner {
        wrapped_coin = _wrapped_coin;
    }

    function setWrappedCoinFee(uint256 _wrapped_coin_fee) external override onlyOwner {
        wrapped_coin_fee = _wrapped_coin_fee;
    }

    function getUserLocks(address user) external view override returns (uint256[] memory) {
        return userTokensLocked[user];
    }

    function getTokenLocks(address token) external view override returns (uint256[] memory) {
        return tokenToLocks[token];
    }

    function lock(
        address token,
        uint256 amount,
        uint256 start_time,
        uint256 duration
    ) external payable override returns (uint256) {
        return lock(token, amount, start_time, duration, msg.sender);
    }

    function lock(
        address token,
        uint256 amount,
        uint256 start_time,
        uint256 duration,
        address owner
    ) public payable override returns (uint256) {
        require(amount > 0, "PSIPadTokenLockFactory: AMOUNT_ZERO");
        require(msg.value >= wrapped_coin_fee, "PSIPadTokenLockFactory: FEE_NOT_PAYED");

        transferFees(msg.value);

        uint256 balance = IERC20Upgradeable(token).balanceOf(address(this));
        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);
        amount = IERC20Upgradeable(token).balanceOf(address(this)).sub(balance);
        require(amount > 0, "PSIPadTokenLockFactory: AMOUNT_ZERO_AFTER_TRANSFER");

        tokensLocked.push(LockingData(owner, token, amount, start_time, duration, 0));
        userTokensLocked[owner].push(tokensLocked.length - 1);
        tokenToLocks[token].push(tokensLocked.length - 1);

        emit TokenLocked(tokensLocked.length - 1, token, owner, amount);

        return tokensLocked.length - 1;
    }

    function transferFees(uint256 fee) internal {
        if (fee > 0) {
            IWETH(wrapped_coin).deposit{value: fee}();
            IERC20Upgradeable(wrapped_coin).safeTransfer(fee_aggregator, fee);
            IFeeAggregator(fee_aggregator).addTokenFee(wrapped_coin, fee);
        }
    }

    function changeOwner(uint256 lockId, address newOwner) external override onlyLockOwner(lockId) {
        tokensLocked[lockId].owner = newOwner;
        userTokensLocked[newOwner].push(lockId);
        uint256 numUserLocks = userTokensLocked[msg.sender].length;

        uint256 idx = numUserLocks - 1;
        while (true) {
            if (userTokensLocked[msg.sender][idx] == lockId) {
                userTokensLocked[msg.sender][idx] = userTokensLocked[msg.sender][numUserLocks - 1];
                break;
            }
            require(idx != 0, "PSIPadTokenLockFactory: OLD_OWNER_NOT_FOUND");
            idx--;
        }
        userTokensLocked[msg.sender].pop();

        emit OwnerChanged(lockId, msg.sender, newOwner);
    }

    function unlock(uint256 lockId, uint256 amount) external override onlyLockOwner(lockId) {
        uint256 amountAvailable = amountToUnlock(lockId);
        require(amountAvailable >= amount, "PSIPadTokenLockFactory: AMOUNT_TO_HIGH_OR_LOCKED");
        _unlock(lockId, amount);
    }

    function unlockAvailable(uint256 lockId) external override onlyLockOwner(lockId) {
        uint256 amountAvailable = amountToUnlock(lockId);
        require(amountAvailable > 0, "PSIPadTokenLockFactory: NO_AMOUNT_AVAILABLE");
        _unlock(lockId, amountAvailable);
    }

    function _unlock(uint256 lockId, uint256 amount) internal {
        tokensLocked[lockId].amountUnlocked += amount;
        IERC20Upgradeable(tokensLocked[lockId].token).safeTransfer(tokensLocked[lockId].owner, amount);
        emit TokenUnlocked(lockId, tokensLocked[lockId].token, amount);
    }

    function amountToUnlock(uint256 lockId) public view override returns (uint256) {
        uint256 amount = unlockedAmount(lockId);
        if (amount > 0) return amount.sub(tokensLocked[lockId].amountUnlocked);
        return 0;
    }

    function unlockedAmount(uint256 lockId) public view override returns (uint256) {
        if (tokensLocked[lockId].amount == 0 || block.timestamp <= tokensLocked[lockId].start_time) return 0;

        uint256 timePassed = block.timestamp.sub(tokensLocked[lockId].start_time);
        if (timePassed >= tokensLocked[lockId].duration) return tokensLocked[lockId].amount;
        return tokensLocked[lockId].amount.mul(timePassed).div(tokensLocked[lockId].duration);
    }
}
