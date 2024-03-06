# Solidity API

## ProxyForCakePoolFactory

### Parameters

```solidity
struct Parameters {
  address VECake;
  address user;
}
```

### parameters

```solidity
struct ProxyForCakePoolFactory.Parameters parameters
```

### VECake

```solidity
address VECake
```

### initialization

```solidity
bool initialization
```

### NewProxy

```solidity
event NewProxy(address proxy, address user)
```

### onlyVECake

```solidity
modifier onlyVECake()
```

### constructor

```solidity
constructor() public
```

Constructor

### initialize

```solidity
function initialize(address _VECake) external
```

Initialize

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _VECake | address |  |

### deploy

```solidity
function deploy(address _user) external returns (address proxy)
```

Deploy proxy for cake pool

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address |  |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proxy | address | The proxy address |

