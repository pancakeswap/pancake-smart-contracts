// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin-4.5.0/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin-4.5.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IVECake.sol";

contract Delegator is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IVECake public immutable VECake;

    /**
     * @notice Constructor
     * @param _VECake: VECake contract
     * @param _token: Cake Token contract
     */
    constructor(IVECake _VECake, IERC20 _token) ERC20("VECake Delegator Token", "VDT") {
        VECake = _VECake;
        token = _token;
        token.safeApprove(address(_VECake), type(uint256).max);
    }

    function createLock(uint256 _amount, uint256 _unlockTime) external {
        token.safeTransferFrom(msg.sender, address(this), _amount);
        VECake.createLock(_amount, _unlockTime);
    }

    function withdrawAll(address _to) external {
        VECake.withdrawAll(_to);
    }

    function earlyWithdraw(address _to, uint256 _amount) external {
        VECake.earlyWithdraw(_to, _amount);
    }

    function increaseLockAmount(uint256 _amount) external {
        token.safeTransferFrom(msg.sender, address(this), _amount);
        VECake.increaseLockAmount(_amount);
    }

    function increaseUnlockTime(uint256 _newUnlockTime) external {
        VECake.increaseUnlockTime(_newUnlockTime);
    }

    function emergencyWithdraw() external {
        VECake.emergencyWithdraw();
    }

    /// @notice Delegate in delegator smart contract.
    /// @param user The user address
    /// @param amount The delegated cake amount
    /// @param lockEndTime The lock end time in cake pool.
    function delegate(
        address user,
        uint256 amount,
        uint256 lockEndTime
    ) external {
        _mint(user, amount);
    }
}
