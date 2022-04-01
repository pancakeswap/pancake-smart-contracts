// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IMasterChef.sol";

contract IFOPool is Ownable, Pausable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct UserInfo {
        uint256 shares; // number of shares for a user
        uint256 lastDepositedTime; // keeps track of deposited time for potential penalty
        uint256 cakeAtLastUserAction; // keeps track of cake deposited at the last user action
        uint256 lastUserActionTime; // keeps track of the last user action time
    }
    //IFO
    struct UserIFOInfo {
        // ifo valid period is current block between startblock and endblock
        uint256 lastActionBalance; // staked cake numbers (not include compoud cake) at last action
        uint256 lastValidActionBalance; // staked cake numbers in ifo valid period
        uint256 lastActionBlock; //  last action block number
        uint256 lastValidActionBlock; // last action block number in ifo valid period
        uint256 lastAvgBalance; // average balance in ifo valid period
    }

    enum IFOActions {
        Deposit,
        Withdraw
    }

    IERC20 public immutable token; // Cake token
    IERC20 public immutable receiptToken; // Syrup token

    IMasterChef public immutable masterchef;

    mapping(address => UserInfo) public userInfo;
    //IFO
    mapping(address => UserIFOInfo) public userIFOInfo;

    uint256 public startBlock;
    uint256 public endBlock;

    uint256 public totalShares;
    uint256 public lastHarvestedTime;
    address public admin;
    address public treasury;

    uint256 public constant MAX_PERFORMANCE_FEE = 600; // 6%
    uint256 public constant MAX_CALL_FEE = 100; // 1%
    uint256 public constant MAX_WITHDRAW_FEE = 400; // 4%
    uint256 public constant MAX_WITHDRAW_FEE_PERIOD = 168 hours; // 7 days

    uint256 public performanceFee = 200; // 2%
    uint256 public callFee = 25; // 0.25%
    uint256 public withdrawFee = 10; // 0.1%
    uint256 public withdrawFeePeriod = 72 hours; // 3 days

    event Pause();
    event Unpause();
    event Deposit(address indexed sender, uint256 amount, uint256 shares, uint256 lastDepositedTime);
    event Withdraw(address indexed sender, uint256 amount, uint256 shares);
    event Harvest(address indexed sender, uint256 performanceFee, uint256 callFee);
    event UpdateEndBlock(uint256 endBlock);
    event ZeroFreeIFO(address indexed sender, uint256 currentBlock);
    event UpdateStartAndEndBlocks(uint256 startBlock, uint256 endBlock);
    event UpdateUserIFO(
        address indexed sender,
        uint256 lastAvgBalance,
        uint256 lastActionBalance,
        uint256 lastValidActionBalance,
        uint256 lastActionBlock,
        uint256 lastValidActionBlock
    );

    /**
     * @notice Constructor
     * @param _token: Cake token contract
     * @param _receiptToken: Syrup token contract
     * @param _masterchef: MasterChef contract
     * @param _admin: address of the admin
     * @param _treasury: address of the treasury (collects fees)
     * @param _startBlock: IFO start block height
     * @param _endBlock: IFO end block height
     */
    constructor(
        IERC20 _token,
        IERC20 _receiptToken,
        IMasterChef _masterchef,
        address _admin,
        address _treasury,
        uint256 _startBlock,
        uint256 _endBlock
    ) public {
        require(block.number < _startBlock, "start block can't behind current block");
        require(_startBlock < _endBlock, "end block can't behind start block");

        token = _token;
        receiptToken = _receiptToken;
        masterchef = _masterchef;
        admin = _admin;
        treasury = _treasury;
        startBlock = _startBlock;
        endBlock = _endBlock;

        // Infinite approve
        IERC20(_token).safeApprove(address(_masterchef), uint256(-1));
    }

    /**
     * @notice Checks if the msg.sender is the admin address
     */
    modifier onlyAdmin() {
        require(msg.sender == admin, "admin: wut?");
        _;
    }

    /**
     * @notice Checks if the msg.sender is a contract or a proxy
     */
    modifier notContract() {
        require(!_isContract(msg.sender), "contract not allowed");
        require(msg.sender == tx.origin, "proxy contract not allowed");
        _;
    }

    /**
     * @notice Deposits funds into the Cake Vault
     * @dev Only possible when contract not paused.
     * @param _amount: number of tokens to deposit (in CAKE)
     */
    function deposit(uint256 _amount) external whenNotPaused notContract {
        require(_amount > 0, "Nothing to deposit");

        uint256 pool = balanceOf();
        token.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 currentShares = 0;
        if (totalShares != 0) {
            currentShares = (_amount.mul(totalShares)).div(pool);
        } else {
            currentShares = _amount;
        }
        require(currentShares > 0, "deposit amount is too small to allocate shares");

        UserInfo storage user = userInfo[msg.sender];

        user.shares = user.shares.add(currentShares);
        user.lastDepositedTime = block.timestamp;

        totalShares = totalShares.add(currentShares);

        user.cakeAtLastUserAction = user.shares.mul(balanceOf()).div(totalShares);
        user.lastUserActionTime = block.timestamp;
        //IFO
        _updateUserIFO(_amount, IFOActions.Deposit);

        _earn();

        emit Deposit(msg.sender, _amount, currentShares, block.timestamp);
    }

    /**
     * @notice check IFO is avaliable
     * @dev This function will be called that need to calculate average balance
     */
    function _isIFOAvailable() internal view returns (bool) {
        // actually block.number = startBlock is ifo available status
        // but the avgbalance must be zero, so we don't add this boundary
        return block.number > startBlock;
    }

    /**
     * @notice This function only be called to judge whether to update last action block.
     * @dev only block number between start block and end block to update last action block.
     */
    function _isValidActionBlock() internal view returns (bool) {
        return block.number >= startBlock && block.number <= endBlock;
    }

    /**
     * @notice calculate user IFO latest avgBalance.
     * @dev only calculate average balance when IFO is available, other return 0.
     * @param _lastActionBlock: last action(deposit/withdraw) block number.
     * @param _lastValidActionBlock: last valid action(deposit/withdraw) block number.
     * @param _lastActionBalance: last valid action(deposit/withdraw) block number.
     * @param _lastValidActionBalance: staked cake number at last action.
     * @param _lastAvgBalance: last average balance.
     */
    function _calculateAvgBalance(
        uint256 _lastActionBlock,
        uint256 _lastValidActionBlock,
        uint256 _lastActionBalance,
        uint256 _lastValidActionBalance,
        uint256 _lastAvgBalance
    ) internal view returns (uint256 avgBalance) {
        uint256 currentBlock = block.number; //reused

        // (_lastActionBlock > endBlock) means lastavgbalance have updated after endblock,
        // subsequent action should not update lastavgbalance again
        if (_lastActionBlock >= endBlock) {
            return _lastAvgBalance;
        }

        // first time participate current ifo
        if (_lastValidActionBlock < startBlock) {
            _lastValidActionBlock = startBlock;
            _lastAvgBalance = 0;
            _lastValidActionBalance = _lastActionBalance;
        }

        currentBlock = currentBlock < endBlock ? currentBlock : endBlock;

        uint256 lastContribute = _lastAvgBalance.mul(_lastValidActionBlock.sub(startBlock));
        uint256 currentContribute = _lastValidActionBalance.mul(currentBlock.sub(_lastValidActionBlock));
        avgBalance = (lastContribute.add(currentContribute)).div(currentBlock.sub(startBlock));
    }

    /**
     * @notice update userIFOInfo
     * @param _amount:the cake amount that need be add or sub
     * @param _action:IFOActions enum element
     */
    function _updateUserIFO(uint256 _amount, IFOActions _action) internal {
        UserIFOInfo storage IFOInfo = userIFOInfo[msg.sender];

        uint256 avgBalance = !_isIFOAvailable()
            ? 0
            : _calculateAvgBalance(
                IFOInfo.lastActionBlock,
                IFOInfo.lastValidActionBlock,
                IFOInfo.lastActionBalance,
                IFOInfo.lastValidActionBalance,
                IFOInfo.lastAvgBalance
            );

        if (_action == IFOActions.Withdraw) {
            IFOInfo.lastActionBalance = _amount > IFOInfo.lastActionBalance
                ? 0
                : IFOInfo.lastActionBalance.sub(_amount);
        } else {
            IFOInfo.lastActionBalance = IFOInfo.lastActionBalance.add(_amount);
        }

        if (_isValidActionBlock()) {
            IFOInfo.lastValidActionBalance = IFOInfo.lastActionBalance;
            IFOInfo.lastValidActionBlock = block.number;
        }

        IFOInfo.lastAvgBalance = avgBalance;
        IFOInfo.lastActionBlock = block.number;
        emit UpdateUserIFO(
            msg.sender,
            IFOInfo.lastAvgBalance,
            IFOInfo.lastActionBalance,
            IFOInfo.lastValidActionBalance,
            IFOInfo.lastActionBlock,
            IFOInfo.lastValidActionBlock
        );
    }

    /**
     * @notice calculate IFO latest average balance for specific user
     * @param _user: user address
     */
    function getUserCredit(address _user) external view returns (uint256 avgBalance) {
        UserIFOInfo storage IFOInfo = userIFOInfo[_user];

        if (_isIFOAvailable()) {
            avgBalance = _calculateAvgBalance(
                IFOInfo.lastActionBlock,
                IFOInfo.lastValidActionBlock,
                IFOInfo.lastActionBalance,
                IFOInfo.lastValidActionBalance,
                IFOInfo.lastAvgBalance
            );
        } else {
            avgBalance = 0;
        }
    }

    /**
     * @notice Withdraws all funds for a user
     */
    function withdrawAll() external notContract {
        withdraw(userInfo[msg.sender].shares);
    }

    /**
     * @notice Withdraws user all funds in emergency,it's called by user not admin,the userifo status will be clear
     */
    function emergencyWithdrawAll() external notContract {
        _zeroFreeIFO();
        withdrawV1(userInfo[msg.sender].shares);
    }

    /**
     * @notice set userIFOInfo to initial state
     */
    function _zeroFreeIFO() internal {
        UserIFOInfo storage IFOInfo = userIFOInfo[msg.sender];

        IFOInfo.lastActionBalance = 0;
        IFOInfo.lastValidActionBalance = 0;
        IFOInfo.lastActionBlock = 0;
        IFOInfo.lastValidActionBlock = 0;
        IFOInfo.lastAvgBalance = 0;

        emit ZeroFreeIFO(msg.sender, block.number);
    }

    /**
     * @notice Withdraws from funds from the IFOPool
     * @param _shares: Number of shares to withdraw
     */
    function withdraw(uint256 _shares) public notContract {
        UserInfo storage user = userInfo[msg.sender];
        require(_shares > 0, "Nothing to withdraw");
        require(_shares <= user.shares, "Withdraw amount exceeds balance");

        uint256 currentAmount = (balanceOf().mul(_shares)).div(totalShares);
        uint256 ifoDeductAmount = currentAmount;
        user.shares = user.shares.sub(_shares);
        totalShares = totalShares.sub(_shares);

        uint256 bal = available();
        if (bal < currentAmount) {
            uint256 balWithdraw = currentAmount.sub(bal);
            IMasterChef(masterchef).leaveStaking(balWithdraw);
            uint256 balAfter = available();
            uint256 diff = balAfter.sub(bal);
            if (diff < balWithdraw) {
                currentAmount = bal.add(diff);
            }
        }

        if (block.timestamp < user.lastDepositedTime.add(withdrawFeePeriod)) {
            uint256 currentWithdrawFee = currentAmount.mul(withdrawFee).div(10000);
            token.safeTransfer(treasury, currentWithdrawFee);
            currentAmount = currentAmount.sub(currentWithdrawFee);
        }

        if (user.shares > 0) {
            user.cakeAtLastUserAction = user.shares.mul(balanceOf()).div(totalShares);
        } else {
            user.cakeAtLastUserAction = 0;
        }

        user.lastUserActionTime = block.timestamp;

        //IFO
        _updateUserIFO(ifoDeductAmount, IFOActions.Withdraw);

        token.safeTransfer(msg.sender, currentAmount);

        emit Withdraw(msg.sender, currentAmount, _shares);
    }

    /**
     * @notice original Withdraws implementation from funds, the logic same as Cake Vault withdraw
     * @notice this function visibility change to internal, call only be called by 'emergencyWithdrawAll' function
     * @param _shares: Number of shares to withdraw
     */
    function withdrawV1(uint256 _shares) internal {
        UserInfo storage user = userInfo[msg.sender];
        require(_shares > 0, "Nothing to withdraw");
        require(_shares <= user.shares, "Withdraw amount exceeds balance");

        uint256 currentAmount = (balanceOf().mul(_shares)).div(totalShares);
        user.shares = user.shares.sub(_shares);
        totalShares = totalShares.sub(_shares);

        uint256 bal = available();
        if (bal < currentAmount) {
            uint256 balWithdraw = currentAmount.sub(bal);
            IMasterChef(masterchef).leaveStaking(balWithdraw);
            uint256 balAfter = available();
            uint256 diff = balAfter.sub(bal);
            if (diff < balWithdraw) {
                currentAmount = bal.add(diff);
            }
        }

        if (block.timestamp < user.lastDepositedTime.add(withdrawFeePeriod)) {
            uint256 currentWithdrawFee = currentAmount.mul(withdrawFee).div(10000);
            token.safeTransfer(treasury, currentWithdrawFee);
            currentAmount = currentAmount.sub(currentWithdrawFee);
        }

        if (user.shares > 0) {
            user.cakeAtLastUserAction = user.shares.mul(balanceOf()).div(totalShares);
        } else {
            user.cakeAtLastUserAction = 0;
        }

        user.lastUserActionTime = block.timestamp;

        token.safeTransfer(msg.sender, currentAmount);

        emit Withdraw(msg.sender, currentAmount, _shares);
    }

    /**
     * @notice Reinvests CAKE tokens into MasterChef
     * @dev Only possible when contract not paused.
     */
    function harvest() external notContract whenNotPaused {
        uint256 beforeBal = available();
        IMasterChef(masterchef).leaveStaking(0);
        uint256 bal = available().sub(beforeBal);

        uint256 currentPerformanceFee = bal.mul(performanceFee).div(10000);
        token.safeTransfer(treasury, currentPerformanceFee);

        uint256 currentCallFee = bal.mul(callFee).div(10000);
        token.safeTransfer(msg.sender, currentCallFee);

        _earn();

        lastHarvestedTime = block.timestamp;

        emit Harvest(msg.sender, currentPerformanceFee, currentCallFee);
    }

    /**
     * @notice Sets admin address
     * @dev Only callable by the contract owner.
     */
    function setAdmin(address _admin) external onlyOwner {
        require(_admin != address(0), "Cannot be zero address");
        admin = _admin;
    }

    /**
     * @notice Sets treasury address
     * @dev Only callable by the contract owner.
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Cannot be zero address");
        treasury = _treasury;
    }

    /**
     * @notice Sets performance fee
     * @dev Only callable by the contract admin.
     */
    function setPerformanceFee(uint256 _performanceFee) external onlyAdmin {
        require(_performanceFee <= MAX_PERFORMANCE_FEE, "performanceFee cannot be more than MAX_PERFORMANCE_FEE");
        performanceFee = _performanceFee;
    }

    /**
     * @notice Sets call fee
     * @dev Only callable by the contract admin.
     */
    function setCallFee(uint256 _callFee) external onlyAdmin {
        require(_callFee <= MAX_CALL_FEE, "callFee cannot be more than MAX_CALL_FEE");
        callFee = _callFee;
    }

    /**
     * @notice Sets withdraw fee
     * @dev Only callable by the contract admin.
     */
    function setWithdrawFee(uint256 _withdrawFee) external onlyAdmin {
        require(_withdrawFee <= MAX_WITHDRAW_FEE, "withdrawFee cannot be more than MAX_WITHDRAW_FEE");
        withdrawFee = _withdrawFee;
    }

    /**
     * @notice Sets withdraw fee period
     * @dev Only callable by the contract admin.
     */
    function setWithdrawFeePeriod(uint256 _withdrawFeePeriod) external onlyAdmin {
        require(
            _withdrawFeePeriod <= MAX_WITHDRAW_FEE_PERIOD,
            "withdrawFeePeriod cannot be more than MAX_WITHDRAW_FEE_PERIOD"
        );
        withdrawFeePeriod = _withdrawFeePeriod;
    }

    /**
     * @notice It allows the admin to update start and end blocks
     * @dev This function is only callable by owner.
     * @param _startBlock: the new start block
     * @param _endBlock: the new end block
     */
    function updateStartAndEndBlocks(uint256 _startBlock, uint256 _endBlock) external onlyAdmin {
        require(block.number < _startBlock, "Pool current block must be lower than new startBlock");
        require(_startBlock < _endBlock, "New startBlock must be lower than new endBlock");

        startBlock = _startBlock;
        endBlock = _endBlock;

        emit UpdateStartAndEndBlocks(_startBlock, _endBlock);
    }

    /**
     * @notice It allows the admin to update end block
     * @dev This function is only callable by owner.
     * @param _endBlock: the new end block
     */
    function updateEndBlock(uint256 _endBlock) external onlyAdmin {
        require(block.number < _endBlock, "new end block can't behind current block");
        require(block.number < endBlock, "old end block can't behind current block");

        endBlock = _endBlock;

        emit UpdateEndBlock(_endBlock);
    }

    /**
     * @notice Withdraws from MasterChef to Vault without caring about rewards.
     * @dev EMERGENCY ONLY. Only callable by the contract admin.
     */
    function emergencyWithdraw() external onlyAdmin {
        IMasterChef(masterchef).emergencyWithdraw(0);
        if (!paused()) {
            _pause();
        }
    }

    /**
     * @notice Withdraw unexpected tokens sent to the Cake Vault
     */
    function inCaseTokensGetStuck(address _token) external onlyAdmin {
        require(_token != address(token), "Token cannot be same as deposit token");
        require(_token != address(receiptToken), "Token cannot be same as receipt token");

        uint256 amount = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransfer(msg.sender, amount);
    }

    /**
     * @notice Triggers stopped state
     * @dev Only possible when contract not paused.
     */
    function pause() external onlyAdmin whenNotPaused {
        _pause();
        emit Pause();
    }

    /**
     * @notice Returns to normal state
     * @dev Only possible when contract is paused.
     */
    function unpause() external onlyAdmin whenPaused {
        _unpause();
        emit Unpause();
    }

    /**
     * @notice Calculates the expected harvest reward from third party
     * @return Expected reward to collect in CAKE
     */
    function calculateHarvestCakeRewards() external view returns (uint256) {
        uint256 amount = IMasterChef(masterchef).pendingCake(0, address(this));
        uint256 currentCallFee = amount.mul(callFee).div(10000);

        return currentCallFee;
    }

    /**
     * @notice Calculates the total pending rewards that can be restaked
     * @return Returns total pending cake rewards
     */
    function calculateTotalPendingCakeRewards() external view returns (uint256) {
        uint256 amount = IMasterChef(masterchef).pendingCake(0, address(this));
        amount = amount.add(available());

        return amount;
    }

    /**
     * @notice Calculates the price per share
     */
    function getPricePerFullShare() external view returns (uint256) {
        return totalShares == 0 ? 1e18 : balanceOf().mul(1e18).div(totalShares);
    }

    /**
     * @notice Custom logic for how much the vault allows to be borrowed
     * @dev The contract puts 100% of the tokens to work.
     */
    function available() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /**
     * @notice Calculates the total underlying tokens
     * @dev It includes tokens held by the contract and held in MasterChef
     */
    function balanceOf() public view returns (uint256) {
        (uint256 amount, ) = IMasterChef(masterchef).userInfo(0, address(this));
        return token.balanceOf(address(this)).add(amount);
    }

    /**
     * @notice Deposits tokens into MasterChef to earn staking rewards
     */
    function _earn() internal {
        uint256 bal = available();
        if (bal > 0) {
            IMasterChef(masterchef).enterStaking(bal);
        }
    }

    /**
     * @notice Checks if address is a contract
     * @dev It prevents contract from being targetted
     */
    function _isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }
}
