// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

interface IFeeAggregator {
    function isFeeToken(address token) external view returns (bool);

    function addFeeToken(address token) external;

    function addTokenFee(address token, uint256 fee) external;
}
