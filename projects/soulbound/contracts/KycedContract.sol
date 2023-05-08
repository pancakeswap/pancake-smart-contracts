// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./IceCreamSwapKyc.sol";

contract KycedContract is IceCreamSwapKyc {
    using CountersUpgradeable for CountersUpgradeable.Counter;

    mapping(uint256 => uint256) delegators;

    function safeMint(address to, uint256 delegatorKycId) public onlyRole(MINTER_ROLE) {
        uint256 tokenId = IceCreamSwapKyc._tokenIdCounter.current();
        delegators[tokenId] = delegatorKycId;

        IceCreamSwapKyc.safeMint(to);
    }

    function safeMint(address) public pure override(IceCreamSwapKyc) {
        revert("missing argument");
    }

    function getDelegator(uint256 tokenId) external view returns (uint256 delegator) {
        delegator = delegators[tokenId];
    }
}
