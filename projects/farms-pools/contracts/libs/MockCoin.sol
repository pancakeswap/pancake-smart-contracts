// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockCoin is ERC20 {
    /*
     * Constructor
     * @param name: coin name (e.g. Mock Coin)
     * @param symbol: symbol of the coin (e.g. COIN)
     * @param supply: supply
     * @param decimals: decimals of the token
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 supply,
        uint8 decimals,
        address receiver
    ) public ERC20(name, symbol) {
        _mint(receiver, supply);
        _setupDecimals(decimals);
    }
}
