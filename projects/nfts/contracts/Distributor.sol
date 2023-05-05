// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * Stores nextep for easier accounting
*/
contract DistributorStorage is Ownable {
    /// Address of NEXTEP token
    IERC20 public nextep;

    constructor(IERC20 nextepToken) Ownable() {
        nextep = nextepToken;
    }

    function transferTo(address recipient, uint256 amount) external onlyOwner() {
        nextep.transfer(recipient, amount);
    }
}

/**
 * Distribute received nextep tokens to NFT owners
*/
contract Distributor is Ownable {

    /// Address of the NFT token
    IERC721Enumerable public token;
    /// Address of NEXTEP token
    IERC20 public nextep;
    /// Fired when a new distribution cycle has been created and provides its index
    event Distributed(uint256 index);
    /// Stores a distribution cycle data
    struct Distribution {
        uint256 totalAmount;
        uint256 remainingUnits;
        uint256 amountPerUnit;
    }
    /// Used to make sure each nft can only claim once per distribution cycle
    mapping(uint256 => mapping(uint256 => bool)) claimed;
    /// Array of distribution cycles
    Distribution[] public distributions;

    DistributorStorage nextepStorage;

    constructor(IERC721Enumerable nftToken, IERC20 nextepToken) 
    Ownable() {
        nextep = nextepToken;
        token = nftToken;
        nextepStorage = new DistributorStorage(nextep);
    }

    /** Create a new cycle of distribution
    */
    function distribute() external onlyOwner() {
       uint256 nextepBalance = nextep.balanceOf(address(this));
       require(nextepBalance > 0, "Distributor: Nothing to distribute");
       uint256 totalNftSupply = token.totalSupply();
       uint256 amountPerUnit = nextepBalance / totalNftSupply;
       // use this to prevent dust accumulation
       uint256 totalAmount = amountPerUnit * totalNftSupply;
       // store these tokens for distribution
       nextep.transfer(address(nextepStorage), totalAmount);
       distributions.push(Distribution(totalAmount, totalNftSupply, amountPerUnit));
       emit Distributed(distributions.length - 1);
    }

    /** Claim from all distributions
     * !!! After a certain amount of distributions, there wont be enough gas in a block to execute this function
    */
    function claim() external {
        for(uint i = 0; i < distributions.length; i++) {
            _claimDistributionFor(msg.sender, i);
        }
    }

    /** Admin function to distribute manually to an account
     * @param account Account to whom we distribute
     * @param index Distribution index in the array
    */
    function claimDistributionFor(address account, uint256 index) external onlyOwner() {
        _claimDistributionFor(account, index);
    }

    /** Admin function to fetch all nextep stored in storage and send it to another address
     * @param recipient Address to send the nextep tokens to
    */
    function emergencyWithdraw(address recipient) external onlyOwner() {
        nextepStorage.transferTo(recipient, nextep.balanceOf(address(nextepStorage)));
    }

    /** Distribute manually to an account
     * @param account Account to whom we distribute
     * @param index Distribution index in the array
    */
    function _claimDistributionFor(address account, uint256 index) internal {
        uint256 userBalance = token.balanceOf(account);
        uint256 unitsAbleToClaim = 0;
        
        // compute the amount of nfts owned by this user that can claim
        for(uint i = 0; i < userBalance; i++) {
            if(!claimed[index][token.tokenOfOwnerByIndex(account, i)]) {
                // flag this token to have claimed already in this distribution
                claimed[index][token.tokenOfOwnerByIndex(account, i)] = true;
                unitsAbleToClaim++;
            }
        }

        uint256 claimableAmount = unitsAbleToClaim * distributions[index].amountPerUnit;
        if(claimableAmount > 0) {
            distributions[index].remainingUnits -= unitsAbleToClaim;
            nextepStorage.transferTo(account, claimableAmount);
        }
    }
}
