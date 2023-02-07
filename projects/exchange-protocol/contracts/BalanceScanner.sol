/**
 *Submitted for verification at Etherscan.io on 2020-03-13
*/

pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

/**
 * @title An Ether or token balance scanner
 * @author Maarten Zuidhoorn
 * @author Luit Hollander
 */
contract BalanceScanner {

  constructor() public {}
  /**
   * @notice Get the Ether balance for all addresses specified
   * @param addresses The addresses to get the Ether balance for
   * @return balances The Ether balance for all addresses in the same order as specified
   */
  function etherBalances(address[] calldata addresses) external view returns (uint256[] memory balances) {
    balances = new uint256[](addresses.length);

    for (uint256 i = 0; i < addresses.length; i++) {
      balances[i] = addresses[i].balance;
    }
  }

  /**
   * @notice Get the ERC-20 token balance of `token` for all addresses specified
   * @dev This does not check if the `token` address specified is actually an ERC-20 token
   * @param addresses The addresses to get the token balance for
   * @param token The address of the ERC-20 token contract
   * @return balances The token balance for all addresses in the same order as specified
   */
  function tokenBalances(address[] calldata addresses, address token) external returns (uint256[] memory balances) {
    balances = new uint256[](addresses.length);

    for (uint256 i = 0; i < addresses.length; i++) {
      balances[i] = tokenBalance(addresses[i], token);
    }
  }

  /**
   * @notice Get the ERC-20 token balances for multiple contracts, for multiple addresses
   * @dev This does not check if the `token` address specified is actually an ERC-20 token
   * @param addresses The addresses to get the token balances for
   * @param contracts The addresses of the ERC-20 token contracts
   * @return balances The token balances in the same order as the addresses specified
   */
  function tokensBalances(address[] calldata addresses, address[] calldata contracts) external returns (uint256[][] memory balances) {
    balances = new uint256[][](addresses.length);

    for (uint256 i = 0; i < addresses.length; i++) {
      balances[i] = this.tokensBalance(addresses[i], contracts);
    }
  }

  /**
    * @notice Get the ERC-20 token balance from multiple contracts for a single owner
    * @param owner The address of the token owner
    * @param contracts The addresses of the ERC-20 token contracts
    * @return balances The token balances in the same order as the addresses specified
   */
  function tokensBalance(address owner, address[] calldata contracts) external returns (uint256[] memory balances) {
    balances = new uint256[](contracts.length);

    for (uint256 i = 0; i < contracts.length; i++) {
      balances[i] = tokenBalance(owner, contracts[i]);
    }
  }

  /**
    * @notice Get the ERC-20 token balance for a single contract
    * @param owner The address of the token owner
    * @param token The address of the ERC-20 token contract
    * @return balance The token balance, or zero if the address is not a contract, or does not implement the `balanceOf`
      function
  */
  function tokenBalance(address owner, address token) internal returns (uint256 balance) {
    balance = 0;
    uint256 size = codeSize(token);

    if (size > 0) {
      (bool success, bytes memory data) = token.call(abi.encodeWithSelector(bytes4(0x70a08231), owner));
      if (success) {
        (balance) = abi.decode(data, (uint256));
      }
    }
  }

  /**
    * @notice Get code size of address
    * @param _address The address to get code size from
    * @return size Unsigned 256-bits integer
   */
  function codeSize(address _address) internal view returns (uint256 size) {
    assembly {
      size := extcodesize(_address)
    }
  }
}