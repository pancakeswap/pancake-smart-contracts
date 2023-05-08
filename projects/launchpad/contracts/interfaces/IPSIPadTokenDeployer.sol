// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IPSIPadCampaign.sol";

interface IPSIPadTokenDeployer {
    enum TokenType {
        Base,
        BaseAnySwap
    }

    struct TokenData {
        string name;
        string symbol;
        uint256 initialSupply;
        uint256 maximumSupply;
        bool burnable;
        bool mintable;
        uint256 minterDelay;
        bool crossChain;
        address underlying;
        address vault;
    }

    function fee_aggregator() external view returns (address);

    function stable_coin() external view returns (address);

    function stable_coin_fee() external view returns (uint256);

    function tokenTypes(TokenType typeId) external view returns (address);

    function tokens(uint256 idx) external view returns (address);

    function getUserTokens(address account) external view returns (address[] memory);

    event TokenCreated(address indexed owner, address token, string name, string symbol, uint256 totalSupply);

    function setFeeAggregator(address _fee_aggregator) external;

    function setStableCoin(address _stable_coin) external;

    function setStableCoinFee(uint256 _stable_coin_fee) external;

    function setTokenType(TokenType tokenType, address implementation) external;

    function createToken(TokenData calldata tokenData) external payable returns (address token_address);
}
