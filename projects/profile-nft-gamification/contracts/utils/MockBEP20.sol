// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@pancakeswap/pancake-swap-lib/contracts/token/BEP20/BEP20.sol";

/** @title MockBEP20.
 * @notice It is a mock contract to replace CAKE tokens
 * in tests.
 */
contract MockBEP20 is BEP20 {
    constructor(
        string memory name,
        string memory symbol,
        uint256 supply
    ) public BEP20(name, symbol) {
        _mint(msg.sender, supply);
    }

    // Mint Mock tokens to anyone requesting with a max of 1000 tokens
    function mintTokens(uint256 _amount) external {
        require(_amount < 1000000000000000000001, "1000 tokens max"); // 1000 tokens
        _mint(msg.sender, _amount);
    }
}
