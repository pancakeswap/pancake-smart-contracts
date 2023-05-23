// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./KycedContract.sol";

contract KycedContractMinter is Ownable {
    KycedContract kycedContract;
    IERC20 public feeToken;
    uint256 public feeAmount;
    address feeReceiver;

    constructor(
        KycedContract _kycedContract,
        IERC20 _feeToken,
        uint256 _feeAmount,
        address _feeReceiver
    ) {
        kycedContract = _kycedContract;
        feeToken = _feeToken;
        feeAmount = _feeAmount;
        feeReceiver = _feeReceiver;
    }

    function delegate(
        address to,
        uint256 delegatorKycId,
        bytes memory signature
    ) external {
        checkSignature(to, delegatorKycId, signature);

        feeToken.transferFrom(msg.sender, feeReceiver, feeAmount);

        kycedContract.safeMint(to, delegatorKycId);
    }

    function setFees(
        IERC20 _feeToken,
        uint256 _feeAmount,
        address _feeReceiver
    ) external onlyOwner {
        feeToken = _feeToken;
        feeAmount = _feeAmount;
        feeReceiver = _feeReceiver;
    }

    function checkSignature(
        address to,
        uint256 delegatorKycId,
        bytes memory signature
    ) internal view {
        uint256 chainId = getChainID();
        bytes32 hash = getEthSignedMessageHash(keccak256(abi.encodePacked(chainId, delegatorKycId, to)));

        require(recoverSigner(hash, signature) == owner(), "invalid signature");
    }

    function getEthSignedMessageHash(bytes32 _messageHash) public pure returns (bytes32) {
        /*
        Signature is produced by signing a keccak256 hash with the following format:
        "\x19Ethereum Signed Message\n" + len(msg) + msg
        */
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash));
    }

    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) public pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);

        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig)
        public
        pure
        returns (
            bytes32 r,
            bytes32 s,
            uint8 v
        )
    {
        require(sig.length == 65, "invalid signature length");

        assembly {
            /*
        First 32 bytes stores the length of the signature

        add(sig, 32) = pointer of sig + 32
        effectively, skips first 32 bytes of signature

        mload(p) loads next 32 bytes starting at the memory address p into memory
        */

            // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
            // second 32 bytes
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }

        // implicitly return (r, s, v)
    }

    function getChainID() private view returns (uint256) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return id;
    }
}
