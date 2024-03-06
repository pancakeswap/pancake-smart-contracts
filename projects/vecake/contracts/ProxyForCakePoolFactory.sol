// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin-4.5.0/contracts/access/Ownable.sol";
import "./ProxyForCakePool.sol";

contract ProxyForCakePoolFactory is Ownable {
    struct Parameters {
        address VECake;
        address user;
    }

    Parameters public parameters;

    address public VECake;

    bool public initialization;

    event NewProxy(address indexed proxy, address indexed user);

    modifier onlyVECake() {
        require(msg.sender == VECake, "Not VECake");
        _;
    }

    /// @notice Constructor
    constructor() {}

    /// @notice Initialize
    /// @param _VECake: VECake contract
    function initialize(address _VECake) external onlyOwner {
        require(!initialization, "Already initialized");
        initialization = true;
        VECake = _VECake;
    }

    /// @notice Deploy proxy for cake pool
    /// @param _user: Cake pool user
    /// @return proxy The proxy address
    function deploy(address _user) external onlyVECake returns (address proxy) {
        parameters = Parameters({VECake: VECake, user: _user});

        proxy = address(new ProxyForCakePool{salt: keccak256(abi.encode(VECake, _user, block.timestamp))}());

        delete parameters;

        emit NewProxy(proxy, _user);
    }
}
