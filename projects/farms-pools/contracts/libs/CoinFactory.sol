// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./MockCoin.sol";

contract CoinFactory is Ownable {
    event NewCoinCreated(address indexed coin);

    constructor() public {
        //
    }

    /*
     * @notice Deploy a new coin contract
     * @param name: coin name (e.g. Mock Coin)
     * @param symbol: symbol of the coin (e.g. COIN)
     * @param supply: supply
     * @param decimals: decimals of the token
     */
    function deployCoin(
        string memory name,
        string memory symbol,
        uint256 supply,
        uint8 decimals
    ) external onlyOwner {
        MockCoin newCoin = new MockCoin(name, symbol, supply, decimals, msg.sender);
        emit NewCoinCreated(address(newCoin));
    }
}
