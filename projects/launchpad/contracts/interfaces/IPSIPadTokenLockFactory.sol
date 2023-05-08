// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IPSIPadTokenLockFactory {
    struct LockingData {
        address owner;
        address token;
        uint256 amount;
        uint256 start_time;
        uint256 duration;
        uint256 amountUnlocked;
    }

    function getTokensLockedCount() external view returns (uint256);

    function fee_aggregator() external view returns (address);

    function wrapped_coin() external view returns (address);

    function wrapped_coin_fee() external view returns (uint256);

    function setFeeAggregator(address _fee_aggregator) external;

    function setWrappedCoin(address _wrapped_coin) external;

    function setWrappedCoinFee(uint256 _wrapped_coin_fee) external;

    function getUserLocks(address user) external view returns (uint256[] memory);

    function getTokenLocks(address token) external view returns (uint256[] memory);

    event TokenLocked(uint256 indexed lockId, address indexed token, address indexed owner, uint256 amount);
    event TokenUnlocked(uint256 indexed lockId, address indexed token, uint256 amount);
    event OwnerChanged(uint256 indexed lockId, address indexed oldOwner, address indexed newOwner);

    function lock(
        address token,
        uint256 amount,
        uint256 start_time,
        uint256 duration
    ) external payable returns (uint256);

    function lock(
        address token,
        uint256 amount,
        uint256 start_time,
        uint256 duration,
        address owner
    ) external payable returns (uint256);

    function changeOwner(uint256 lockId, address newOwner) external;

    function unlock(uint256 lockId, uint256 amount) external;

    function unlockAvailable(uint256 lockId) external;

    function amountToUnlock(uint256 lockId) external view returns (uint256);

    function unlockedAmount(uint256 lockId) external view returns (uint256);
}
