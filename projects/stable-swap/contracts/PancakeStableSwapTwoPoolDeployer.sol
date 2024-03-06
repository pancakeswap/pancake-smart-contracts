// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin-4.5.0/contracts/access/Ownable.sol";
import "./PancakeStableSwapTwoPool.sol";

contract PancakeStableSwapTwoPoolDeployer is Ownable {
    uint256 public constant N_COINS = 2;

    /**
     * @notice constructor
     */
    constructor() {}

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    /**
     * @notice createSwapPair
     * @param _tokenA: Addresses of ERC20 conracts .
     * @param _tokenB: Addresses of ERC20 conracts .
     * @param _A: Amplification coefficient multiplied by n * (n - 1)
     * @param _fee: Fee to charge for exchanges
     * @param _admin_fee: Admin fee
     * @param _admin: Admin
     * @param _LP: LP
     */
    function createSwapPair(
        address _tokenA,
        address _tokenB,
        uint256 _A,
        uint256 _fee,
        uint256 _admin_fee,
        address _admin,
        address _LP
    ) external onlyOwner returns (address) {
        require(_tokenA != address(0) && _tokenB != address(0) && _tokenA != _tokenB, "Illegal token");
        (address t0, address t1) = sortTokens(_tokenA, _tokenB);
        address[N_COINS] memory coins = [t0, t1];
        // create swap contract
        bytes memory bytecode = type(PancakeStableSwapTwoPool).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(t0, t1, msg.sender, block.timestamp, block.chainid));
        address swapContract;
        assembly {
            swapContract := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        PancakeStableSwapTwoPool(swapContract).initialize(coins, _A, _fee, _admin_fee, _admin, _LP);

        return swapContract;
    }
}
