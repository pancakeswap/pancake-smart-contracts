// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IPSIPadCampaign.sol";

interface IPSIPadCampaignFactory {
    function default_factory() external view returns (address);

    function default_router() external view returns (address);

    function fee_aggregator() external view returns (address);

    function stable_coin() external view returns (address);

    function stable_coin_fee() external view returns (uint256);

    function token_fee() external view returns (uint256);

    function cloneAddress() external view returns (address);

    function setDefaultFactory(address _default_factory) external;

    function setDefaultRouter(address _default_router) external;

    function setFeeAggregator(address _fee_aggregator) external;

    function setStableCoin(address _stable_coin) external;

    function setStableCoinFee(uint256 _stable_coin_fee) external;

    function setTokenFee(uint256 _token_fee) external;

    function setCloneAddress(address _cloneAddress) external;

    function setAllowedContracts(address[] calldata _allowedContracts, bool allowed) external;

    event CampaignAdded(address indexed campaign, address indexed token, address indexed owner);
    event CampaignLocked(address indexed campaign, address indexed token, uint256 indexed collected);
    event CampaignUnlocked(address indexed campaign, address indexed token);

    function getUserCampaigns(address user) external view returns (uint256[] memory);

    /**
     * @notice Start a new campaign using
     * @dev 1 ETH = 1 XYZ (_pool_rate = 1e18) <=> 1 ETH = 10 XYZ (_pool_rate = 1e19) <=> XYZ (decimals = 18)
     */
    function createCampaign(
        IPSIPadCampaign.CampaignData calldata _data,
        address _token,
        uint256 _tokenFeePercentage,
        address _factory,
        address _router
    ) external returns (address campaign_address);

    function createCampaignWithOwner(
        IPSIPadCampaign.CampaignData calldata _data,
        address _owner,
        address _token,
        uint256 _tokenFeePercentage,
        address _factory,
        address _router
    ) external returns (address campaign_address);

    /**
     * @notice calculates how many tokens are needed to start an campaign
     */
    function tokensNeeded(IPSIPadCampaign.CampaignData calldata _data, uint256 _tokenFeePercentage)
        external
        view
        returns (uint256 _tokensNeeded);

    /**
     * @notice Add liqudity to an exchange and burn the remaining tokens,
     * can only be executed when the campaign completes
     */
    function lock(uint256 campaignId) external;

    /**
     * @notice allows the owner to unlock the LP tokens and any leftover tokens after the lock has ended
     */
    function unlock(uint256 campaignId) external;

    /**
     * @notice allows the factory owner to perform an emergency refund when tokens are locked f.e.
     */
    function emergencyRefund(uint256 campaignId) external;
}
