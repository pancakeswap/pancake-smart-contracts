// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IPSIPadCampaign {
    struct CampaignData {
        uint256 softCap;
        uint256 hardCap;
        uint256 start_date;
        uint256 end_date;
        uint256 rate;
        uint256 min_allowed;
        uint256 max_allowed;
        uint256 pool_rate;
        uint256 lock_duration;
        uint256 liquidity_rate;
        bool whitelist_enabled;
    }

    function psipad_factory() external view returns (address);

    function factory_address() external view returns (address);

    function router_address() external view returns (address);

    function stable_coin_fee() external view returns (uint256);

    function campaignTokens() external view returns (uint256);

    function feeTokens() external view returns (uint256);

    function lp_address() external view returns (address);

    function unlock_date() external view returns (uint256);

    function finalized() external view returns (bool);

    function locked() external view returns (bool);

    function doRefund() external view returns (bool);

    function whitelistEnabled() external view returns (bool);

    function whitelisted(address _address) external view returns (bool);

    function token() external view returns (address);

    function softCap() external view returns (uint256);

    function hardCap() external view returns (uint256);

    function start_date() external view returns (uint256);

    function end_date() external view returns (uint256);

    function rate() external view returns (uint256);

    function min_allowed() external view returns (uint256);

    function max_allowed() external view returns (uint256);

    function pool_rate() external view returns (uint256);

    function lock_duration() external view returns (uint256);

    function liquidity_rate() external view returns (uint256);

    function collected() external view returns (uint256);

    event Initialized(address indexed owner);
    event TokensBought(address indexed user, uint256 value);
    event CampaignLocked(uint256 collected);
    event CampaignUnlocked();

    /**
     * @notice allows an participant to buy tokens (they can be claimed after the campaign succeeds)
     */
    function buyTokens() external payable;

    /**
     * @notice Add liqudity to an exchange and burn the remaining tokens,
     * can only be executed when the campaign completes
     */
    function lock() external;

    /**
     * @notice Emergency set lp address when funds are f.e. moved. (only possible when tokens are unlocked)
     */
    function setLPAddress(address _lp_address) external;

    /**
     * @notice allows the owner to unlock the LP tokens and any leftover tokens after the lock has ended
     */
    function unlock() external;

    /**
     * @notice Allow participants to withdraw tokens when campaign succeeds
     */
    function withdrawTokens() external returns (uint256);

    /**
     * @notice Allow participants to withdraw funds when campaign fails
     */
    function withdrawFunds() external;

    /**
     * @notice Check whether the campaign is still live
     */
    function isLive() external view returns (bool);

    /**
     * @notice Check whether the campaign failed
     */
    function failed() external view returns (bool);

    /**
     * @notice Returns amount in XYZ
     */
    function calculateAmount(uint256 _amount) external view returns (uint256);

    /**
     * @notice Get remaining tokens not sold
     */
    function getRemaining() external view returns (uint256);

    /**
     * Get an participants contribution
     */
    function getGivenAmount(address _address) external view returns (uint256);

    /**
     * Sets refund (only possible by psi pad factory)
     */
    function emergencyRefund() external;

    function setWhitelistEnabled(bool enabled) external;

    /**
     * packed array of addresses to whitelist
     */
    function addWhitelist(bytes calldata data, bool whitelist) external;
}
