// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import "../IERC2612.sol";
import "../IERC677.sol";

interface IAnyswapV4ERC20 is IERC2612, IERC677 {
    function underlying() external view returns (address);

    // configurable delay for timelock functions
    function delay() external view returns (uint256);

    // set of minters, can be this bridge or other bridges
    function isMinter(address minter) external view returns (bool);

    // primary controller of the token contract
    function vault() external view returns (address);

    function pendingMinter() external view returns (address);

    function delayMinter() external view returns (uint256);

    function pendingVault() external view returns (address);

    function delayVault() external view returns (uint256);

    event LogChangeVault(address indexed oldVault, address indexed newVault, uint256 indexed effectiveTime);
    event LogChangeMPCOwner(address indexed oldOwner, address indexed newOwner, uint256 indexed effectiveHeight);
    event LogSwapin(bytes32 indexed txhash, address indexed account, uint256 amount);
    event LogSwapout(address indexed account, address indexed bindaddr, uint256 amount);
    event LogAddAuth(address indexed auth, uint256 timestamp);

    function mpc() external view returns (address);

    function changeMPCOwner(address newVault) external returns (bool);

    function setVaultOnly(bool enabled) external;

    function initVault(address _vault) external;

    function setVault(address _vault) external;

    function applyVault() external;

    function changeVault(address newVault) external returns (bool);

    function setMinter(address _auth) external;

    function applyMinter() external;

    function revokeMinter(address _auth) external;

    function getAllMinters() external view returns (address[] memory);

    function mint(address to, uint256 amount) external returns (bool);

    function burn(address from, uint256 amount) external returns (bool);

    function Swapin(
        bytes32 txhash,
        address account,
        uint256 amount
    ) external returns (bool);

    function Swapout(uint256 amount, address bindaddr) external returns (bool);

    function depositWithPermit(
        address target,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address to
    ) external returns (uint256);

    function depositWithTransferPermit(
        address target,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address to
    ) external returns (uint256);

    function deposit() external returns (uint256);

    function deposit(uint256 amount) external returns (uint256);

    function deposit(uint256 amount, address to) external returns (uint256);

    function depositVault(uint256 amount, address to) external returns (uint256);

    function withdraw() external returns (uint256);

    function withdraw(uint256 amount) external returns (uint256);

    function withdraw(uint256 amount, address to) external returns (uint256);

    function withdrawVault(
        address from,
        uint256 amount,
        address to
    ) external returns (uint256);
}
