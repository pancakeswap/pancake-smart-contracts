// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;
pragma experimental ABIEncoderV2;

import "../../interfaces/IDepositExecute.sol";
import "../HandlerHelpers.sol";
import "../../ERC20Safe.sol";

/**
    @title Handles ERC20 deposits and deposit executions.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract ERC20HandlerPercentageFee is IDepositExecute, HandlerHelpers, ERC20Safe {
    // token contract address => token minimum fee multiplier
    mapping(address => uint256) public _minFeeMultiplierToken;

    // destination domain id => token minimum fee multiplier
    mapping(uint8 => uint256) public _minFeeMultiplierChain;

    // fee percentage, 100 = 1%
    uint256 public _feePercentage;

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
        @param feePercentage fee percentage for token transfers.
     */
    constructor(address bridgeAddress, uint256 feePercentage) HandlerHelpers(bridgeAddress) {
        _setFeePercentage(feePercentage);
    }

    /**
        @notice A deposit is initiatied by making a deposit in the Bridge contract.
        @param resourceID ResourceID used to find address of token to be used for deposit.
        @param depositer Address of account making the deposit in the Bridge contract.
        @param data Consists of {amount} padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        amount                      uint256     bytes   0 - 32
        @dev Depending if the corresponding {tokenAddress} for the parsed {resourceID} is
        marked true in {_burnList}, deposited tokens will be burned, if not, they will be locked.
        @return bytes amount after fees
     */
    function deposit(
        bytes32 resourceID,
        address depositer,
        uint8 destinationDomainID,
        bytes calldata data
    ) external payable override onlyBridge returns (bytes memory) {
        uint256 amount = abi.decode(data, (uint256));

        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        require(_contractWhitelist[tokenAddress], "provided tokenAddress is not whitelisted");

        uint256 fee = _calculateFee(tokenAddress, destinationDomainID, amount);
        amount -= fee;

        safeTransferFrom(IERC20(tokenAddress), depositer, _bridgeAddress, fee);
        if (_burnList[tokenAddress]) {
            burnERC20(tokenAddress, depositer, amount);
        } else {
            lockERC20(tokenAddress, depositer, address(this), amount);
        }
        return abi.encode(amount);
    }

    /**
        @notice Proposal execution should be initiated when a proposal is finalized in the Bridge contract.
        by a relayer on the deposit's destination chain.
        @param data Consists of {resourceID}, {amount}, {lenDestinationRecipientAddress},
        and {destinationRecipientAddress} all padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        amount                                 uint256     bytes  0 - 32
        destinationRecipientAddress length     uint256     bytes  32 - 64
        destinationRecipientAddress            bytes       bytes  64 - END
     */
    function executeProposal(bytes32 resourceID, bytes calldata data) external override onlyBridge {
        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        require(_contractWhitelist[tokenAddress], "unhandled token");

        bytes memory destinationRecipientAddress;
        (uint256 amount, uint256 lenDestinationRecipientAddress) = abi.decode(data, (uint256, uint256));
        destinationRecipientAddress = bytes(data[64:64 + lenDestinationRecipientAddress]);

        bytes20 recipientAddress;
        assembly {
            recipientAddress := mload(add(destinationRecipientAddress, 0x20))
        }

        if (_burnList[tokenAddress]) {
            mintERC20(tokenAddress, address(recipientAddress), amount);
        } else {
            releaseERC20(tokenAddress, address(recipientAddress), amount);
        }
    }

    /**
        @notice Used to manually release ERC20 tokens from ERC20Safe.
        @param data Consists of {tokenAddress}, {recipient}, and {amount} all padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        tokenAddress                           address     bytes  0 - 32
        recipient                              address     bytes  32 - 64
        amount                                 uint        bytes  64 - 96
     */
    function withdraw(bytes memory data) external override onlyBridge {
        address tokenAddress;
        address recipient;
        uint256 amount;

        (tokenAddress, recipient, amount) = abi.decode(data, (address, address, uint256));

        if (tokenAddress == address(0)) {
            payable(recipient).transfer(amount);
        } else {
            releaseERC20(tokenAddress, recipient, amount);
        }
    }

    function calculateFee(
        bytes32 resourceID,
        address, // depositer
        uint8 destinationDomainID,
        bytes calldata data
    ) external view override returns (address feeToken, uint256 fee) {
        uint256 amount = abi.decode(data, (uint256));

        feeToken = _resourceIDToTokenContractAddress[resourceID];
        require(_contractWhitelist[feeToken], "unhandled token");

        fee = _calculateFee(feeToken, destinationDomainID, amount);
    }

    function changeFee(bytes memory feeData) external onlyBridge {
        uint8 feeType = abi.decode(feeData, (uint8));
        if (feeType == 0) {
            uint256 feePercentage;
            (, feePercentage) = abi.decode(feeData, (uint8, uint256));
            _setFeePercentage(feePercentage);
        } else if (feeType == 1) {
            address tokenAddress;
            uint256 minFeeMultiplierToken;
            (, tokenAddress, minFeeMultiplierToken) = abi.decode(feeData, (uint8, address, uint256));
            _minFeeMultiplierToken[tokenAddress] = minFeeMultiplierToken;
        } else if (feeType == 2) {
            uint8 destinationDomainId;
            uint256 minFeeMultiplierChain;
            (, destinationDomainId, minFeeMultiplierChain) = abi.decode(feeData, (uint8, uint8, uint256));
            _minFeeMultiplierChain[destinationDomainId] = minFeeMultiplierChain;
        } else {
            require(false, "feeType invalid");
        }
    }

    function _calculateFee(
        address tokenAddress,
        uint8 destinationDomainID,
        uint256 tokenAmount
    ) internal view returns (uint256 fee) {
        fee = (tokenAmount * _feePercentage) / 10000;
        uint256 minimalFee = _calculateMinimumFee(tokenAddress, destinationDomainID);

        if (minimalFee > fee) {
            fee = minimalFee;
            require(fee < tokenAmount, "< minFee");
        }
    }

    function _calculateMinimumFee(address tokenAddress, uint8 destinationDomainID)
        internal
        view
        returns (uint256 minimalFee)
    {
        minimalFee = _minFeeMultiplierToken[tokenAddress] * _minFeeMultiplierChain[destinationDomainID];
    }

    function _setFeePercentage(uint256 feePercentage) internal {
        require(feePercentage >= 0 && feePercentage <= 10000, "invalid fee");
        _feePercentage = feePercentage;
    }
}
