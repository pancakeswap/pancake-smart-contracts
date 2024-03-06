// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "./interfaces/IMasterChefV3.sol";

contract MCV3MultiPositionUpdate {
    IMasterChefV3 public immutable MASTER_CHEF_V3;

    /// @param _v3 MasterChefV3 contract address.
    constructor(IMasterChefV3 _v3) {
        MASTER_CHEF_V3 = _v3;
    }

    function multiPositionUpdate(uint256[] calldata _tokenIds) external {
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            MASTER_CHEF_V3.updateLiquidity(_tokenIds[i]);
        }
    }
}
