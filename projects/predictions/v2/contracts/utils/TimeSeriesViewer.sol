// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title TimeSeriesViewer
 */

contract TimeSeriesViewer {
    constructor() {
        //
    }

    /**
     * @notice View historical prices for Chainlink feed
     * @param aggregator: aggregator price address
     * @param firstRoundId: first roundId from Chainlink
     * @param lastRoundId: last roundId from Chainlink
     */
    function viewHistoricalPrices(
        address aggregator,
        uint80 firstRoundId,
        uint80 lastRoundId
    )
        external
        view
        returns (
            uint80[] memory roundIds,
            int256[] memory prices,
            uint256[] memory timestamps
        )
    {
        uint256 numberRounds = lastRoundId - firstRoundId + 1;

        roundIds = new uint80[](numberRounds);
        prices = new int256[](numberRounds);
        timestamps = new uint256[](numberRounds);

        for (uint80 i = firstRoundId; i <= lastRoundId; i++) {
            (roundIds[i], prices[i], , timestamps[i], ) = AggregatorV3Interface(aggregator).getRoundData(i);
        }

        return (roundIds, prices, timestamps);
    }
}
