// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * Distribute received nextep tokens to NFT owners
*/
contract RewardsDistributor is AccessControl {
    /// Address of NEXTEP token
    IERC20 public nextep;
    /// The oracle role updates token holders
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE");
    /// The validator triggers the distributions
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR");
    /// Permil share of the rewards to distribute (1000 = 100%)
    uint256 public rewardShare1000 = 800;
    /// Address of the treasury the remaining tokens will be sent to
    address public treasury;

    /// List of owners for every NFT token
    mapping(uint256 => address) public owners;
    /// @dev Used internally to optimize transfers
    mapping(address => uint256) tempTransfers;
    /// Last time the distribution was triggered (timestamp)
    uint256 public lastCall;

    constructor(address tokenAddr) 
    AccessControl() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setRoleAdmin(ORACLE_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(VALIDATOR_ROLE, DEFAULT_ADMIN_ROLE);
        treasury = msg.sender;
        require(tokenAddr != address(0), "RewardsDistributor: INVALID PARAMS");
        nextep = IERC20(tokenAddr);
    }

    /** Used to change the current treasury address
     * @param newTreasury Address of the new treasury
    */
    function setTreasury(address newTreasury) external {
        require(hasRole(VALIDATOR_ROLE, msg.sender), "RewardsDistributor: FORBIDDEN");
        require(newTreasury != address(0), "RewardsDistributor: INVALID PARAMS");
        treasury = newTreasury;
    }

    /** Used to change the NFT Reward share of the accumulated tokens
     * @param newShare New permil share
    */
    function setRewardShare(uint256 newShare) external {
        require(hasRole(VALIDATOR_ROLE, msg.sender), "RewardsDistributor: FORBIDDEN");
        require(newShare <= 1000, "RewardsDistributor: INVALID PARAMS");
        rewardShare1000 = newShare;
    }

    /** Called by the oracle to update NFT Reward holders
     */
    function update(uint256[] memory ids_list, address[] memory owners_list) external {
        require(hasRole(ORACLE_ROLE, msg.sender), "RewardsDistributor: FORBIDDEN");
        require(ids_list.length == owners_list.length, "RewardsDistributor: INVALID PARAMS");
        // update list of token owners
        for(uint i = 0; i < ids_list.length; i++) {
            owners[ids_list[i]] = owners_list[i];
        }
    }

    /**
        Distribute NEXTEP tokens to current NFT Reward holders
        Only one transfer per holder is operated even if the holder has more than one token
        Can only be called by VALIDATOR
    */
    function validate() external {
        require(hasRole(VALIDATOR_ROLE, msg.sender), "RewardsDistributor: FORBIDDEN");
        uint256 nextepBalance = nextep.balanceOf(address(this));
        uint256 rewardShare = nextepBalance * rewardShare1000 / 1000;
        uint256 rewardPerUnit = rewardShare / 150;

        for(uint i = 0; i < 150; i++) {
            _queueTransfer(owners[i], rewardPerUnit);
        }

        _executeTransfers();

        // send the rest to treasury
        nextep.transfer(treasury, nextep.balanceOf(address(this)));
        lastCall = block.timestamp;
    }

    function _queueTransfer(address destination, uint256 amount) internal {
        require(destination != address(0), "RewardsDistributor: HOLDERS INCOMPLETE");
        tempTransfers[destination] += amount;
    }

    function _executeTransfers() internal {
        for(uint i = 0; i < 150; i++) {
            uint256 toSend = tempTransfers[owners[i]];
            if(toSend > 0) { // ensures that deleted entries would not be triggered again to prevent duplicated distributions
                nextep.transfer(owners[i], toSend);
                delete tempTransfers[owners[i]];
            }
        }
    }    
}
