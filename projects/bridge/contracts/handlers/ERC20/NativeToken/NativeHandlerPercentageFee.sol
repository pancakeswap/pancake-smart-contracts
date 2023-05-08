// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;
pragma experimental ABIEncoderV2;

import "../../../interfaces/IDepositExecute.sol";
import "../../HandlerHelpers.sol";
import "../../../ERC20Safe.sol";

/**
    @title Handles native token deposits and deposit executions.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract NativeHandlerPercentageFee is IDepositExecute, HandlerHelpers, ERC20Safe {
    // token contract address => token minimum fee multiplier
    mapping(address => uint256) public _minFeeMultiplierToken;

    // destination domain id => token minimum fee multiplier
    mapping(uint8 => uint256) public _minFeeMultiplierChain;

    // fee percentage, 100 = 1%
    uint256 public _feePercentage;

    // receiver of the fee in native coins
    address payable public _feeReceiver;

    // single resource ID this contract handles, which is the resource ID for the chains native coin
    bytes32 nativeResourceID;

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
        @param feePercentage fee percentage for token transfers.
     */
    constructor(
        address bridgeAddress,
        uint256 feePercentage,
        address payable feeReceiver
    ) HandlerHelpers(bridgeAddress) {
        _feeReceiver = feeReceiver;
        _setFeePercentage(feePercentage);
    }

    receive() external payable {}

    function changeFeeReceiver(address payable newReceiver) external {
        require(msg.sender == _feeReceiver, "only _feeReceiver");
        _feeReceiver = newReceiver;
    }

    function _setResource(bytes32 resourceID, address contractAddress) internal override {
        require(contractAddress == address(0), "non 0 address for native handler");
        nativeResourceID = resourceID;
    }

    function _setBurnable(
        address /*contractAddress*/
    ) internal pure override {
        require(false, "native token not burnable");
    }

    /**
        @notice A deposit is initiatied by making a deposit in the Bridge contract.
        @param resourceID ResourceID used to find address of token to be used for deposit.
        depositer Address of account making the deposit in the Bridge contract.
        @param data Consists of {amount} padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        amount                      uint256     bytes   0 - 32
        @dev Depending if the corresponding {tokenAddress} for the parsed {resourceID} is
        marked true in {_burnList}, deposited tokens will be burned, if not, they will be locked.
        @return bytes amount after fees
     */
    function deposit(
        bytes32 resourceID,
        address, /*depositer*/
        uint8 destinationDomainID,
        bytes calldata data
    ) external payable override onlyBridge returns (bytes memory) {
        require(resourceID == nativeResourceID, "not native resource ID");

        uint256 amount = abi.decode(data, (uint256));
        require(msg.value == amount, "amount != msg.value");

        uint256 fee = _calculateFee(address(0), destinationDomainID, amount);
        amount -= fee;

        // send fees to fee receiver and keep rest of tokens in this contract
        _feeReceiver.transfer(fee);

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
        require(resourceID == nativeResourceID, "not native resource ID");

        bytes memory destinationRecipientAddress;
        (uint256 amount, uint256 lenDestinationRecipientAddress) = abi.decode(data, (uint256, uint256));
        destinationRecipientAddress = bytes(data[64:64 + lenDestinationRecipientAddress]);

        bytes20 recipientAddress;
        assembly {
            recipientAddress := mload(add(destinationRecipientAddress, 0x20))
        }

        // using transfer instead of call to lower the risk of reentry. Contracts are not intended to react to this transfer
        payable(address(recipientAddress)).transfer(amount);
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
        address, /*depositer*/
        uint8 destinationDomainID,
        bytes calldata data
    ) external view override returns (address feeToken, uint256 fee) {
        uint256 amount = abi.decode(data, (uint256));

        require(resourceID == nativeResourceID, "unhandled token");

        feeToken = address(0);

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
