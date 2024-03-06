// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import "@openzeppelin-4.5.0/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin-4.5.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin-4.5.0/contracts/access/Ownable.sol";
import "../interfaces/IWBNB.sol";
import "../interfaces/IPancakeStableSwap.sol";

contract PancakeStableSwapWBNBHelper is Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant N_COINS = 2;
    IWBNB public immutable WBNB;

    // Record whether approved for stable swap smart contract.
    mapping(address => bool) isApproved;

    mapping(address => bool) public isWhitelist;

    error NotWBNBPair();
    error NotWhitelist();
    error InvalidNCOINS();

    event UpdateWhitelist(address swap, bool status);

    constructor(IWBNB _WBNB) {
        WBNB = _WBNB;
    }

    function setWhiteList(address _swap, bool _status) external onlyOwner {
        isWhitelist[_swap] = _status;
        emit UpdateWhitelist(_swap, _status);
    }

    function initSwapPair(IPancakeStableSwap swap) internal {
        address token0 = swap.coins(0);
        address token1 = swap.coins(1);
        address LPToken = swap.token();
        IERC20(token0).safeApprove(address(swap), type(uint256).max);
        IERC20(token1).safeApprove(address(swap), type(uint256).max);
        IERC20(LPToken).safeApprove(address(swap), type(uint256).max);
        isApproved[address(swap)] = true;
    }

    function add_liquidity(
        IPancakeStableSwap swap,
        uint256[N_COINS] memory amounts,
        uint256 min_mint_amount
    ) external payable {
        if (!isWhitelist[address(swap)]) revert NotWhitelist();
        if (swap.N_COINS() != N_COINS) revert InvalidNCOINS();
        if (!isApproved[address(swap)]) initSwapPair(swap);

        address token0 = swap.coins(0);
        address token1 = swap.coins(1);
        uint256 WBNBIndex;
        if (token0 == address(WBNB)) {
            WBNBIndex = 0;
        } else if (token1 == address(WBNB)) {
            WBNBIndex = 1;
        } else {
            revert NotWBNBPair();
        }
        require(msg.value == amounts[WBNBIndex], "Inconsistent quantity");
        WBNB.deposit{value: msg.value}();
        if (WBNBIndex == 0) {
            IERC20(token1).safeTransferFrom(msg.sender, address(this), amounts[1]);
        } else {
            IERC20(token0).safeTransferFrom(msg.sender, address(this), amounts[0]);
        }
        swap.add_liquidity(amounts, min_mint_amount);

        address LPToken = swap.token();
        uint256 mintedLPAmount = IERC20(LPToken).balanceOf(address(this));
        IERC20(LPToken).safeTransfer(msg.sender, mintedLPAmount);
    }

    function remove_liquidity(
        IPancakeStableSwap swap,
        uint256 _amount,
        uint256[N_COINS] memory min_amounts
    ) external {
        if (!isWhitelist[address(swap)]) revert NotWhitelist();
        if (swap.N_COINS() != N_COINS) revert InvalidNCOINS();
        if (!isApproved[address(swap)]) initSwapPair(swap);

        address token0 = swap.coins(0);
        address token1 = swap.coins(1);
        uint256 WBNBIndex;
        if (token0 == address(WBNB)) {
            WBNBIndex = 0;
        } else if (token1 == address(WBNB)) {
            WBNBIndex = 1;
        } else {
            revert NotWBNBPair();
        }
        address LPToken = swap.token();
        IERC20(LPToken).safeTransferFrom(msg.sender, address(this), _amount);
        swap.remove_liquidity(_amount, min_amounts);

        uint256 WBNBBalance = WBNB.balanceOf(address(this));
        WBNB.withdraw(WBNBBalance);
        _safeTransferBNB(msg.sender, address(this).balance);
        if (WBNBIndex == 0) {
            uint256 token1Balance = IERC20(token1).balanceOf(address(this));
            IERC20(token1).safeTransfer(msg.sender, token1Balance);
        } else {
            uint256 token0Balance = IERC20(token0).balanceOf(address(this));
            IERC20(token0).safeTransfer(msg.sender, token0Balance);
        }
    }

    function _safeTransferBNB(address to, uint256 value) internal {
        (bool success, ) = to.call{gas: 2300, value: value}("");
        require(success, "TransferHelper: BNB_TRANSFER_FAILED");
    }

    receive() external payable {
        assert(msg.sender == address(WBNB)); // only accept BNB from the WBNB contract
    }
}
