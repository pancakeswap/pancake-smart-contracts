// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

/**
 * @dev For more information on transferAndCall format, see https://github.com/ethereum/EIPs/issues/677
 */
interface IERC677 {
    /**
     * @dev Sets `value` as allowance of `spender` account over caller account's AnyswapV3ERC20 token,
     * after which a call is executed to an ERC677-compliant contract with the `data` parameter.
     * Emits {Approval} event.
     * Returns boolean value indicating whether operation succeeded.
     * For more information on approveAndCall format, see https://github.com/ethereum/EIPs/issues/677.
     */
    function approveAndCall(
        address spender,
        uint256 value,
        bytes calldata data
    ) external returns (bool);

    /**
     * @dev Moves `value` AnyswapV3ERC20 token from caller's account to account (`to`),
     * after which a call is executed to an ERC677-compliant contract with the `data` parameter.
     * A transfer to `address(0)` triggers an ETH withdraw matching the sent AnyswapV3ERC20 token in favor of caller.
     * Emits {Transfer} event.
     * Returns boolean value indicating whether operation succeeded.
     * Requirements:
     *   - caller account must have at least `value` AnyswapV3ERC20 token.
     * For more information on transferAndCall format, see https://github.com/ethereum/EIPs/issues/677.
     */
    function transferAndCall(
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bool);
}
