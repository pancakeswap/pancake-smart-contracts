// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin-4.5.0/contracts/access/Ownable.sol";
import "./PancakeStableSwapThreePool.sol";

contract PancakeStableSwapThreePoolDeployer is Ownable {
    uint256 public constant N_COINS = 3;

    /**
     * @notice constructor
     */
    constructor() {}

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(
        address tokenA,
        address tokenB,
        address tokenC
    )
        internal
        pure
        returns (
            address,
            address,
            address
        )
    {
        require(tokenA != tokenB && tokenA != tokenC && tokenB != tokenC, "IDENTICAL_ADDRESSES");
        address tmp;
        if (tokenA > tokenB) {
            tmp = tokenA;
            tokenA = tokenB;
            tokenB = tmp;
        }
        if (tokenB > tokenC) {
            tmp = tokenB;
            tokenB = tokenC;
            tokenC = tmp;
            if (tokenA > tokenB) {
                tmp = tokenA;
                tokenA = tokenB;
                tokenB = tmp;
            }
        }
        return (tokenA, tokenB, tokenC);
    }

    /**
     * @notice createSwapPair
     * @param _tokenA: Addresses of ERC20 conracts .
     * @param _tokenB: Addresses of ERC20 conracts .
     * @param _tokenC: Addresses of ERC20 conracts .
     * @param _A: Amplification coefficient multiplied by n * (n - 1)
     * @param _fee: Fee to charge for exchanges
     * @param _admin_fee: Admin fee
     * @param _admin: Admin
     * @param _LP: LP
     */
    function createSwapPair(
        address _tokenA,
        address _tokenB,
        address _tokenC,
        uint256 _A,
        uint256 _fee,
        uint256 _admin_fee,
        address _admin,
        address _LP
    ) external onlyOwner returns (address) {
        require(_tokenA != address(0) && _tokenB != address(0) && _tokenA != _tokenB, "Illegal token");
        (address t0, address t1, address t2) = sortTokens(_tokenA, _tokenB, _tokenC);
        address[N_COINS] memory coins = [t0, t1, t2];
        // create swap contract
        bytes memory bytecode = type(PancakeStableSwapThreePool).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(t0, t1, t2, msg.sender, block.timestamp, block.chainid));
        address swapContract;
        assembly {
            swapContract := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        PancakeStableSwapThreePool(swapContract).initialize(coins, _A, _fee, _admin_fee, _admin, _LP);

        return swapContract;
    }
}
