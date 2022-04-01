# PancakeBunnies (WIP)

This document explains how the `PancakeBunnies` contract works.

## 1. Variables

### Public variables

#### Mappings

- `bunnyCount`: checks how many bunnies are deployed per `bunnyId`
- `bunnyBurnCount`: checks how many were burnt per `bunnyId`

#### String

- `baseURI`: "ipfs://"
- `name`: "Pancake Bunnies"
- `symbol`: "PB"

### Private variables

_(TODO)_

## 2. Functions

### Public functions

#### View functions

- `getBunnyId(_tokenId)`: it returns the bunnyId for a `_tokenId`
- `getBunnyName(_bunnyId)`: it returns the bunny name (string) for a `_bunnyId`
- `getBunnyNameOfTokenId(_tokenId)`: it returns the bunny name (string) for a `_tokenId`

#### Inherited view functions

- `balanceOf(owner)`: checks how many NFTs an address has
- `ownerOf(tokenId)`: checks who is the owner of a tokenId
- `tokenOfOwnerByIndex(owner, index)`: checks who is the owner of the first NFT owned by an address (use with balanceOf)
- `tokenByIndex(index)`: checks the tokenId for each token (use with totalSupply) (NOTE: not useful for FE)
- `totalSupply()`: returns how many tokens exist (excl. burnt)

#### User functions (inherited)

- `safeTransferFrom(from, to, tokenId)`:
- `transferFrom(from, to, tokenId)`
- `approve(to, tokenId)`
- `getApproved(tokenId)`
- `setApprovalForAll(operator, _approved)`
- `isApprovedForAll(owner, operator)`
- `safeTransferFrom(from, to, tokenId, data)`

### 2.2 Private functions

_TODO_

## 3. Events

Note: all these events are inherited.

- `Approval(owner, approved, tokenId)`
- `ApprovalForAll(owner, operator, approved)`
- `Transfer(from, to, tokenId)`
