// SPDX-License-Identifier: Apache2.0
pragma solidity ^0.8;

interface IPledgeAgent {
    struct CoinDelegator {
        uint256 deposit;
        uint256 newDeposit;
        uint256 changeRound;
        uint256 rewardIndex;
    }

    function getDelegator(address agent, address delegator) external view returns (CoinDelegator memory);

    function requiredCoinDeposit() external view returns (uint256);

    function delegateCoin(address agent) external payable;

    function undelegateCoin(address agent) external;

    function transferCoin(address sourceAgent, address targetAgent) external;

    function claimReward(address[] calldata agentList) external returns (uint256, bool);
}
