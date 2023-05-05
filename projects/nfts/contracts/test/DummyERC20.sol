// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DummyERC20 is ERC20 {
    constructor() 
    ERC20("test","test")
    {
        _mint(msg.sender, 100000*10**18);
    }
}
