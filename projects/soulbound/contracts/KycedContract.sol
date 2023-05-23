// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./IceCreamSwapKyc.sol";

contract KycedContract is IceCreamSwapKyc {
    using CountersUpgradeable for CountersUpgradeable.Counter;

    mapping(uint256 => uint256) public delegators;

    function safeMint(address to, uint256 delegatorKycId) public onlyRole(MINTER_ROLE) {
        uint256 tokenId = IceCreamSwapKyc._tokenIdCounter.current();
        delegators[tokenId] = delegatorKycId;

        IceCreamSwapKyc.safeMint(to);
    }

    function safeMint(address) public pure override(IceCreamSwapKyc) {
        revert("missing argument");
    }

    function _safeMint(
        address to,
        uint256 tokenId,
        bytes memory
    ) internal override {
        _mint(to, tokenId);
    }

    function _safeTransfer(
        address from,
        address to,
        uint256 tokenId,
        bytes memory
    ) internal override {
        _transfer(from, to, tokenId);
    }

    function getDelegator(uint256 tokenId) external view returns (uint256 delegator) {
        delegator = delegators[tokenId];
    }
}
