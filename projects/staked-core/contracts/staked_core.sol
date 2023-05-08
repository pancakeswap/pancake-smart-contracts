// SPDX-FileCopyrightText: © 2023 IceCreamSwap support@icecreamswap.com
// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPledgeAgent.sol";

contract StakedCore is ERC20, Ownable {
    IPledgeAgent public immutable corePledgeAgent = IPledgeAgent(0x0000000000000000000000000000000000001007);
    address public defaultAgent; // address new deposits are staked with
    uint256 public totalDelegate; // total amount of CORE delegated to POS
    uint256 public totalRewards; // total amount of rewards earned through delegating to POS
    uint256 public lastCompound; // timestamp when rewards were last compounded
    uint256[] public dailyRewards; // % based daily rewards from staking, 1_000_000 are 0.1% daily
    uint256 public withdrawCompensationToday; // total compensations from withdrawls today
    bool public compoundOnTransfer; // whether to auto compound rewards on token transfers
    uint256 public performanceFee; // cut of the staking rewards that go to the operator, 1_000 are 1% performance fee
    address public feeWallet; // address to send the performance rewards to
    address[] public agentList; // list of all staked/delegated POS agents
    mapping(address => bool) public isStakedAgent; // mapping of whether an address is a used POS staking
    mapping(address => bool) public isPriceBalancer; // mapping of whether an address is a price balancer and can also make deposits without paying the fee compensation

    event deposited(address indexed sender, uint256 amountCore, uint256 amountScore);
    event withdrawn(address indexed sender, uint256 amountCore, uint256 amountScore, uint256 feeCore);

    constructor(address _defaultAgent, address _feeWallet) ERC20("StakedCore", "SCORE") {
        defaultAgent = _defaultAgent;
        feeWallet = _feeWallet;

        compoundOnTransfer = true;

        addStakedAgent(_defaultAgent);

        lastCompound = block.timestamp;
    }

    receive() external payable {
        if (_msgSender() == address(corePledgeAgent)) {
            return;
        }
        deposit();
    }

    /*********************** External methods **************************/

    function deposit() public payable {
        deposit(defaultAgent);
    }

    function deposit(address agent) public payable {
        // compound first
        _compound();

        // calculate SCORE amount to mint
        uint256 mintAmount = getScoreAmount(msg.value);

        // make sure agent is added
        addStakedAgent(agent);

        // increase totalDelegate by the newly delegated amount
        totalDelegate += msg.value;

        // delegate CORE to pos delegation
        corePledgeAgent.delegateCoin{value: msg.value}(agent);

        // mint SCORE
        _mint(_msgSender(), mintAmount);

        emit deposited(_msgSender(), msg.value, mintAmount);
    }

    function withdraw(uint256 agentId) external {
        address agent = agentList[agentId];

        // undelegate CORE tokens from specified agent
        uint256 withdrawnCore = address(this).balance;
        corePledgeAgent.undelegateCoin(agent);
        withdrawnCore = address(this).balance - withdrawnCore;

        // calculate amount of SCORE to burn
        uint256 scoreCost = getScoreAmount(withdrawnCore);

        uint256 missingRewardsPenalty;
        if (!isPriceBalancer[_msgSender()] && dailyRewards.length != 0) {
            // take 1 day worth of rewards and restake it instead of withdraw due to withdraw compensates for the lost 1 day worth of rewards
            missingRewardsPenalty = (withdrawnCore * dailyRewards[dailyRewards.length - 1]) / 1_000_000_000;
        }
        uint256 defaultAgentFunding;
        if (agent == defaultAgent) {
            // defaultAgent can never be unfunded as compounding might compound less than requiredCoinDeposit tokens and would revert
            // if for any reason requiredCoinDeposit does revert, ignore it to prevent SCORE tokens not beeing withdrawable
            try corePledgeAgent.requiredCoinDeposit() returns (uint256 _defaultAgentFunding) {
                defaultAgentFunding = _defaultAgentFunding;
            } catch {}
        }
        if (missingRewardsPenalty + defaultAgentFunding != 0) {
            // if delegation reverts, just ignore it to prevent SCORE tokens not beeing withdrawable
            try corePledgeAgent.delegateCoin{value: missingRewardsPenalty + defaultAgentFunding}(defaultAgent) {
                withdrawnCore -= missingRewardsPenalty + defaultAgentFunding;
                scoreCost -= getScoreAmount(defaultAgentFunding);
            } catch {
                missingRewardsPenalty = 0;
            }
        }

        // remove agent from agentList
        removeStakedAgent(agentId);

        // increment withdrawCompensationToday by missingRewardsPenalty
        withdrawCompensationToday += missingRewardsPenalty;

        // substract withdrawnCore from totalDelegate
        totalDelegate -= withdrawnCore;

        // burn msg.senders SCORE tokens he undelegated
        _burn(_msgSender(), scoreCost);

        // send withdrawn amount minus fees to sender
        payable(_msgSender()).transfer(withdrawnCore);

        emit withdrawn(_msgSender(), withdrawnCore, scoreCost, missingRewardsPenalty);
    }

    function compound() public {
        // compound
        _compound();
    }

    function recalculateTotalStaked() public {
        totalDelegate = totalStaked();
    }

    function cleanAgentsList() public {
        for (uint256 i = agentList.length; i > 0; i--) {
            if (stakedByAgent(agentList[i - 1]) == 0) {
                removeStakedAgent(i - 1);
            }
        }
    }

    /*********************** Public view ********************************/

    function agentListLength() external view returns (uint256) {
        return agentList.length;
    }

    function dailyRewardsLength() external view returns (uint256) {
        return dailyRewards.length;
    }

    function stakedByAgent(address agent) public view returns (uint256) {
        return corePledgeAgent.getDelegator(agent, address(this)).newDeposit;
    }

    function totalStaked() public view returns (uint256 staked) {
        for (uint256 i = 0; i < agentList.length; i++) {
            staked += stakedByAgent(agentList[i]);
        }
    }

    function getScoreAmount(uint256 amountCore) public view returns (uint256) {
        if (totalSupply() == 0) {
            return amountCore;
        }
        return (amountCore * totalSupply()) / totalDelegate;
    }

    /*********************** Governance **************************/

    function updateDefaultAgent(address _defaultAgent) external onlyOwner {
        require(stakedByAgent(_defaultAgent) != 0, "new defaultAgent not funded");
        defaultAgent = _defaultAgent;
        addStakedAgent(_defaultAgent);
        cleanAgentsList();
    }

    function updateFeeWallet(address _feeWallet) external onlyOwner {
        feeWallet = _feeWallet;
    }

    function updatePerformanceFee(uint256 _performanceFee) external onlyOwner {
        require(0 <= performanceFee && performanceFee <= 100_000, "invalid fee");
        performanceFee = _performanceFee;
    }

    function updateCompoundOnTransfer(bool _compoundOnTransfer) external onlyOwner {
        compoundOnTransfer = _compoundOnTransfer;
    }

    function redelegate(address[] calldata agents, uint256[] calldata amounts) external onlyOwner {
        require(agents.length == amounts.length, "unequal argument length");

        // make sure all rewards are claimed actively so they are tracked
        _compound();

        // remove or increase delegation
        for (uint256 i = 0; i < agents.length; i++) {
            if (agents[i] == address(0)) {
                // undelegate and use amount as agentId
                uint256 agentId = amounts[i];
                corePledgeAgent.undelegateCoin(agentList[agentId]);
                removeStakedAgent(agentId); // this switches the order of agentList, so need to be factored in
            } else {
                // delegate CORE to pos staking
                corePledgeAgent.delegateCoin{value: amounts[i]}(agents[i]);
                addStakedAgent(agents[i]);
            }
        }
        require(address(this).balance == 0, "token leftovers");
        require(stakedByAgent(defaultAgent) != 0, "defaultAgent not funded");
    }

    function updateIsPriceBalancer(address wallet, bool isBalancer) external onlyOwner {
        isPriceBalancer[wallet] = isBalancer;
    }

    /*********************** Internal methods ***************************/

    function _afterTokenTransfer(
        address,
        address,
        uint256
    ) internal override {
        if (compoundOnTransfer) {
            uint256 timeSinceLastCompound = block.timestamp - lastCompound;
            if (timeSinceLastCompound >= 1 hours) {
                // only try to compound if last try is at least 1 hour ago
                compound();
            }
        }
    }

    function addStakedAgent(address agent) internal {
        require(agent != address(0), "invalid agent");
        if (!isStakedAgent[agent]) {
            agentList.push(agent);
            isStakedAgent[agent] = true;
        }
    }

    function removeStakedAgent(uint256 agentId) internal {
        require(agentId < agentList.length, "invalid agentId");
        address agent = agentList[agentId];
        if (agent == defaultAgent) {
            return;
        }
        agentList[agentId] = agentList[agentList.length - 1];
        agentList.pop();
        isStakedAgent[agent] = false;
    }

    function _compound() internal {
        // claim rewards
        uint256 balanceBefore = address(this).balance;
        corePledgeAgent.claimReward(agentList);
        uint256 balance = address(this).balance;

        // refresh lastCompound timestamp
        lastCompound = block.timestamp;

        if (balanceBefore == balance) {
            // early return if nothing is claimable yet
            return;
        }

        if (performanceFee != 0) {
            // take performanceFee
            uint256 fee = (balance * performanceFee) / 100_000;
            _mint(feeWallet, getScoreAmount(fee));
        }

        // calculate daily rewards, takes for granted that the contract is called at least once per day
        dailyRewards.push(((balance - balanceBefore + withdrawCompensationToday) * 1_000_000_000) / totalDelegate);

        // reset withdraw compensation
        withdrawCompensationToday = 0;

        // increase totalDelegate by the restaked rewards
        totalDelegate += balance;

        // increase totalRewards by the claimed rewards
        totalRewards += balance - balanceBefore;

        // re deposit the rewards
        corePledgeAgent.delegateCoin{value: balance}(defaultAgent);
    }
}
