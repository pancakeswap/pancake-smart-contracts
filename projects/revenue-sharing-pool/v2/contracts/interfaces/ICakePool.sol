// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface ICakePool {
    struct UserInfo {
        uint256 shares; // number of shares for a user.
        uint256 lastDepositedTime; // keep track of deposited time for potential penalty.
        uint256 cakeAtLastUserAction; // keep track of cake deposited at the last user action.
        uint256 lastUserActionTime; // keep track of the last user action time.
        uint256 lockStartTime; // lock start time.
        uint256 lockEndTime; // lock end time.
        uint256 userBoostedShare; // boost share, in order to give the user higher reward. The user only enjoys the reward, so the principal needs to be recorded as a debt.
        bool locked; //lock status.
        uint256 lockedAmount; // amount deposited during lock period.
    }

    function userInfo(address user)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            bool,
            uint256
        );

    function freePerformanceFeeUsers(address user) external view returns (bool);

    function freeWithdrawFeeUsers(address user) external view returns (bool);

    function freeOverdueFeeUsers(address user) external view returns (bool);

    function getPricePerFullShare() external view returns (uint256);

    function overdueFee() external view returns (uint256);

    function performanceFee() external view returns (uint256);

    function performanceFeeContract() external view returns (uint256);

    function totalShares() external view returns (uint256);

    function totalBoostDebt() external view returns (uint256);

    function balanceOf() external view returns (uint256);

    function available() external view returns (uint256);

    function BOOST_WEIGHT() external view returns (uint256);

    function MAX_LOCK_DURATION() external view returns (uint256);

    function deposit(uint256 _amount, uint256 _lockDuration) external;

    function withdrawByAmount(uint256 _amount) external;

    function withdraw(uint256 _shares) external;

    function withdrawAll() external;
}
