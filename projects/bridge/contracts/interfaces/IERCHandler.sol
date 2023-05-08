// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

/**
    @title Interface to be used with handlers that support ERC20s and ERC721s.
    @author ChainSafe Systems.
 */
interface IERCHandler {
    /**
        @notice Correlates {resourceID} with {contractAddress}.
        @param resourceID ResourceID to be used when making deposits.
        @param contractAddress Address of contract to be called when a deposit is made and a deposited is executed.
     */
    function setResource(bytes32 resourceID, address contractAddress) external;

    /**
        @notice Marks {contractAddress} as mintable/burnable.
        @param contractAddress Address of contract to be used when making or executing deposits.
     */
    function setBurnable(address contractAddress) external;

    /**
        @notice Withdraw funds from ERC safes.
        @param data ABI-encoded withdrawal params relevant to the handler.
     */
    function withdraw(bytes memory data) external;

    /**
        @notice changed bridge address.
        @param newBridgeAddress address of new bridge.
     */
    function changeBridgeAddress(address newBridgeAddress) external;

    /**
        @notice calculate handler fees for deposit.
        @param resourceID ResourceID used to find address of handler to be used for deposit.
        @param depositer user who will call the Bridge deposit.
        @param destinationDomainID ID of chain deposit will be bridged to.
        @param data Additional data to be passed to specified handler.
     */
    function calculateFee(
        bytes32 resourceID,
        address depositer,
        uint8 destinationDomainID,
        bytes calldata data
    ) external view returns (address feeToken, uint256 fee);

    /**
        @notice Changes fee for handler.
        @param feeData ABI-encoded fee params relevant to the handler.
     */
    function changeFee(bytes memory feeData) external;
}
