// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "./interfaces/IPSIPadCampaignERC20.sol";
import "./interfaces/IPSIPadTokenLockFactory.sol";
import "./interfaces/token/IBEP20.sol";
import "./interfaces/token/IWETH.sol";
import "./interfaces/exchange/IPSIPadFactory.sol";
import "./interfaces/exchange/IPSIPadRouter.sol";

contract PSIPadCampaign is IPSIPadCampaign, Initializable, OwnableUpgradeable {
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public constant override psipad_factory = address(0);

    address public override factory_address;
    address public override router_address;
    address public lock_address;
    uint256 public vesting_percentage;
    uint256 public vesting_period;
    uint256 public constant override stable_coin_fee = 0;
    uint256 public constant override campaignTokens = 0;
    uint256 public constant override feeTokens = 0;

    address public override lp_address;
    uint256 public override unlock_date = 0;

    bool public override finalized = false;
    bool public override locked = false;
    bool public override doRefund = false;

    mapping(address => uint256) private participants;

    bool public whitelistEnabled = false;
    mapping(address => bool) public override whitelisted;

    address public override token;
    address public raisedToken;
    uint256 public override softCap;
    uint256 public override hardCap;
    uint256 public override start_date;
    uint256 public override end_date;
    uint256 public override rate;
    uint256 public override min_allowed;
    uint256 public override max_allowed;
    uint256 public override pool_rate;
    uint256 public override lock_duration;
    uint256 public override liquidity_rate;

    uint256 public override collected;

    /**
     * @notice Initialize a new campaign (can only be triggered by the factory contract)
     */
    function initialize(
        CampaignData calldata _data,
        address _token,
        address _raisedToken,
        address _owner,
        address _factory_address,
        address _router_address,
        address _lock_address,
        uint256 _vesting_percentage,
        uint256 _vesting_period
    ) external initializer {
        super.__Ownable_init();
        transferOwnership(_owner);

        require(_vesting_percentage >= 0 && _vesting_percentage <= 100);

        token = _token;
        raisedToken = _raisedToken;
        softCap = _data.softCap;
        hardCap = _data.hardCap;
        start_date = _data.start_date;
        end_date = _data.end_date;
        rate = _data.rate;
        min_allowed = _data.min_allowed;
        max_allowed = _data.max_allowed;
        pool_rate = _data.pool_rate;
        lock_duration = _data.lock_duration;
        liquidity_rate = _data.liquidity_rate;
        whitelistEnabled = _data.whitelist_enabled;

        factory_address = _factory_address;
        router_address = _router_address;

        lock_address = _lock_address;
        vesting_percentage = _vesting_percentage;
        vesting_period = _vesting_period;

        emit Initialized(_owner);
    }

    /**
     * @notice allows an participant to buy tokens (they can be claimed after the campaign succeeds)
     */
    function buyTokens(uint256 amount) external {
        require(isLive(), "PSIPadCampaign: CAMPAIGN_NOT_LIVE");
        require(!whitelistEnabled || whitelisted[_msgSender()], "PSIPadCampaign: NOT_WHITELISTED");
        require(amount >= min_allowed, "PSIPadCampaign: BELOW_MIN_AMOUNT");
        require(getGivenAmount(_msgSender()).add(amount) <= max_allowed, "PSIPadCampaign: ABOVE_MAX_AMOUNT");
        require((amount <= getRemaining()), "PSIPadCampaign: CONTRACT_INSUFFICIENT_TOKENS");

        IERC20Upgradeable(raisedToken).safeTransferFrom(_msgSender(), address(this), amount);

        collected = (collected).add(amount);

        // finalize the campaign when hardcap is reached or minimum deposit is not possible anymore
        if (collected >= hardCap || (hardCap - collected) < min_allowed) finalized = true;
        participants[_msgSender()] = participants[_msgSender()].add(amount);

        emit TokensBought(_msgSender(), amount);
    }

    /**
     * @notice Add liqudity to an exchange and burn the remaining tokens,
     * can only be executed when the campaign completes
     */
    function lock() external override onlyOwner {
        require(!locked, "PSIPadCampaign: LIQUIDITY_ALREADY_LOCKED");
        require(block.timestamp >= start_date, "PSIPadCampaign: CAMPAIGN_NOT_STARTED");
        require(!isLive(), "PSIPadCampaign: CAMPAIGN_STILL_LIVE");
        require(!failed(), "PSIPadCampaign: CAMPAIGN_FAILED");

        addLiquidity();

        if (!doRefund) {
            locked = true;
            unlock_date = (block.timestamp).add(lock_duration);

            emit CampaignLocked(collected);
        }
    }

    function addLiquidity() internal {
        lp_address = IPSIPadFactory(factory_address).getPair(token, raisedToken);

        if (lp_address == address(0) || IBEP20(lp_address).totalSupply() <= 0) {
            uint256 stableLiquidity = collected.mul(liquidity_rate).div(10000);

            if (stableLiquidity > 0) {
                uint256 tokenLiquidity = (stableLiquidity.mul(pool_rate)).div(1e18);
                IBEP20(token).approve(router_address, tokenLiquidity);
                IBEP20(raisedToken).approve(router_address, stableLiquidity);

                IPSIPadRouter(router_address).addLiquidity(
                    address(token),
                    address(raisedToken),
                    tokenLiquidity,
                    stableLiquidity,
                    0,
                    0,
                    address(this),
                    block.timestamp + 1000
                );

                if (lp_address == address(0)) {
                    lp_address = IPSIPadFactory(factory_address).getPair(token, raisedToken);
                    require(lp_address != address(0), "PSIPadCampaign: lp address not set");
                }
            }

            IERC20Upgradeable(raisedToken).safeTransfer(owner(), collected.sub(stableLiquidity));
        } else {
            doRefund = true;
        }
    }

    /**
     * @notice Emergency set lp address when funds are f.e. moved. (only possible when tokens are unlocked)
     */
    function setLPAddress(address _lp_address) external override onlyOwner {
        require(locked && !failed(), "PSIPadCampaign: LIQUIDITY_NOT_LOCKED");
        require(block.timestamp >= unlock_date, "PSIPadCampaign: TOKENS_ARE_LOCKED");
        lp_address = _lp_address;
    }

    /**
     * @notice allows the owner to unlock the LP tokens and any leftover tokens after the lock has ended
     */
    function unlock() external override onlyOwner {
        require(locked && !failed(), "PSIPadCampaign: LIQUIDITY_NOT_LOCKED");
        require(block.timestamp >= unlock_date, "PSIPadCampaign: TOKENS_ARE_LOCKED");
        IERC20Upgradeable(lp_address).safeTransfer(owner(), IBEP20(lp_address).balanceOf(address(this)));
        IERC20Upgradeable(token).safeTransfer(owner(), IBEP20(token).balanceOf(address(this)));
        IERC20Upgradeable(raisedToken).safeTransfer(owner(), IBEP20(raisedToken).balanceOf(address(this)));
        emit CampaignUnlocked();
    }

    /**
     * @notice Allow participants to withdraw tokens when campaign succeeds
     */
    function withdrawTokens() external override returns (uint256) {
        require(locked, "PSIPadCampaign: LIQUIDITY_NOT_ADDED");
        require(!failed(), "PSIPadCampaign: CAMPAIGN_FAILED");
        require(participants[_msgSender()] > 0, "PSIPadCampaign: NO_PARTICIPANT");
        uint256 amount = calculateAmount(participants[_msgSender()]);
        participants[_msgSender()] = 0;

        uint256 lockAmount = (amount * vesting_percentage) / 100;

        IERC20Upgradeable(token).approve(lock_address, lockAmount);
        IPSIPadTokenLockFactory(lock_address).lock(token, lockAmount, end_date, vesting_period, _msgSender());

        IERC20Upgradeable(token).safeTransfer(_msgSender(), amount - lockAmount);
        return amount;
    }

    /**
     * @notice Allow participants to withdraw funds when campaign fails
     */
    function withdrawFunds() external override {
        require(failed(), "PSIPadCampaign: CAMPAIGN_NOT_FAILED");

        if (_msgSender() == owner() && IBEP20(token).balanceOf(address(this)) > 0) {
            IERC20Upgradeable(token).safeTransfer(owner(), IBEP20(token).balanceOf(address(this)));
        }

        if (participants[_msgSender()] > 0) {
            uint256 withdrawAmount = participants[_msgSender()];
            participants[_msgSender()] = 0;
            IERC20Upgradeable(raisedToken).safeTransfer(_msgSender(), withdrawAmount);
        }
    }

    /**
     * @notice Check whether the campaign is still live
     */
    function isLive() public view override returns (bool) {
        if ((block.timestamp < start_date)) return false;
        if ((block.timestamp >= end_date)) return false;
        if (finalized) return false;
        return true;
    }

    /**
     * @notice Check whether the campaign failed
     */
    function failed() public view override returns (bool) {
        return ((block.timestamp >= end_date) && softCap > collected) || doRefund;
    }

    /**
     * @notice Returns amount in XYZ
     */
    function calculateAmount(uint256 _amount) public view override returns (uint256) {
        return (_amount.mul(rate)).div(1e18);
    }

    /**
     * @notice Get remaining tokens not sold
     */
    function getRemaining() public view override returns (uint256) {
        return (hardCap).sub(collected);
    }

    /**
     * Get an participant's contribution
     */
    function getGivenAmount(address _address) public view override returns (uint256) {
        return participants[_address];
    }

    function emergencyRefund() external override onlyOwner {
        doRefund = true;
    }

    function setWhitelistEnabled(bool enabled) external override onlyOwner {
        whitelistEnabled = enabled;
    }

    function addWhitelist(address[] calldata addresses, bool whitelist) external override onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            whitelisted[addresses[i]] = whitelist;
        }
    }

    function modifySoftCap(uint256 _softCap) external onlyOwner {
        softCap = _softCap;
    }

    function modifyHardCap(uint256 _hardCap) external onlyOwner {
        hardCap = _hardCap;
    }

    function modifyRate(uint256 _rate) external onlyOwner {
        rate = _rate;
    }

    function modifyListingRate(uint256 _pool_rate) external onlyOwner {
        pool_rate = _pool_rate;
    }

    function modifyStartDate(uint256 _start_date) external onlyOwner {
        start_date = _start_date;
    }

    function modifyEndDate(uint256 _end_date) external onlyOwner {
        end_date = _end_date;
    }

    function modifyMinAllowed(uint256 _min_allowed) external onlyOwner {
        min_allowed = _min_allowed;
    }

    function modifyMaxAllowed(uint256 _max_allowed) external onlyOwner {
        max_allowed = _max_allowed;
    }

    function modifyVestingPercentage(uint256 _vesting_percentage) external onlyOwner {
        vesting_percentage = _vesting_percentage;
    }

    function modifyVestingPeriod(uint256 _vesting_period) external onlyOwner {
        vesting_period = _vesting_period;
    }

    function modifyTokenAddress(address _token) external onlyOwner {
        token = _token;
    }
}
