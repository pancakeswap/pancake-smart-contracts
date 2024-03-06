// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

struct ItMap {
    // pid => boost
    mapping(uint256 => uint256) data;
    // pid => index
    mapping(uint256 => uint256) indexs;
    // array of pid
    uint256[] keys;
    // never use it, just for keep compile success.
    uint256 size;
}

library IterableMapping {
    function insert(
        ItMap storage self,
        uint256 key,
        uint256 value
    ) internal {
        uint256 keyIndex = self.indexs[key];
        self.data[key] = value;
        if (keyIndex > 0) return;
        else {
            self.indexs[key] = self.keys.length + 1;
            self.keys.push(key);
            return;
        }
    }

    function remove(ItMap storage self, uint256 key) internal {
        uint256 index = self.indexs[key];
        if (index == 0) return;
        uint256 lastKey = self.keys[self.keys.length - 1];
        if (key != lastKey) {
            self.keys[index - 1] = lastKey;
            self.indexs[lastKey] = index;
        }
        delete self.data[key];
        delete self.indexs[key];
        self.keys.pop();
    }

    function contains(ItMap storage self, uint256 key) internal view returns (bool) {
        return self.indexs[key] > 0;
    }
}
