# Solidity API

## SafeCast

_Wrappers over Solidity's uintXX/intXX casting operators with added overflow
checks.

Downcasting from uint256/int256 in Solidity does not revert on overflow. This can
easily result in undesired exploitation or bugs, since developers usually
assume that overflows raise errors. `SafeCast` restores this intuition by
reverting the transaction when such an operation overflows.

Using this library instead of the unchecked operations eliminates an entire
class of bugs, so it's recommended to use it always.

Can be combined with {SafeMath} and {SignedSafeMath} to extend it to smaller types, by performing
all math on `uint256` and `int256` and then downcasting._

### toUint256

```solidity
function toUint256(int256 value) internal pure returns (uint256)
```

_Converts a signed int256 into an unsigned uint256.

Requirements:

- input must be greater than or equal to 0._

### toInt128

```solidity
function toInt128(int256 value) internal pure returns (int128)
```

_Returns the downcasted int128 from int256, reverting on
overflow (when the input is less than smallest int128 or
greater than largest int128).

Counterpart to Solidity's `int128` operator.

Requirements:

- input must fit into 128 bits

_Available since v3.1.__

