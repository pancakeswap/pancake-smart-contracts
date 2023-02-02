// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.8.4;

import "./interfaces/IPancakeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract NEXTEP is IPancakeERC20 {
    using SafeMath for uint256;

    uint256 MAX_INT = 2**256 - 1;

    string public constant override name = "NEXTEP";
    string public constant override symbol = "NEXTEP";
    uint8 public constant override decimals = 18;
    uint256 public override totalSupply = 87500000000e18;

    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    uint256 public sellFee = 400;
    uint256 public buyFee = 400;

    address public feeTo;

    mapping(address => bool) public tradelist;
    mapping(address => bool) public whitelist;

    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    bytes32 public override DOMAIN_SEPARATOR;
    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 public constant override PERMIT_TYPEHASH = 0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;
    mapping(address => uint256) public override nonces;

    event PaidPurchaseFee(address indexed account, uint256 fee, uint256 finalValue);
    event PaidSellingFee(address indexed account, uint256 fee, uint256 finalValue);
    event FeesChanged(uint256 sellFee, uint256 buyFee, uint256 oldSellFee, uint256 oldBuyFee);
    event FeeToChanged(address feeTo, address oldFeeTo);

    constructor(address _feeTo, address owner_) {
        feeTo = _feeTo;
        _setOwner(owner_);
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );

        balanceOf[owner()] = totalSupply;
        emit Transfer(address(0), owner(), totalSupply);
    }

    function setFees(uint256 _sellFee, uint256 _buyFee) external onlyOwner {
        require(_sellFee <= 500 && _buyFee <= 500, "NEXTEP: Maximum buy or sell fee is 5%");
        emit FeesChanged(_sellFee, _buyFee, sellFee, buyFee);
        sellFee = _sellFee;
        buyFee = _buyFee;
    }

    function setFeeTo(address _feeTo) external onlyOwner {
        require(_feeTo != address(0), "NEXTEP: invalid address");
        emit FeeToChanged(_feeTo, feeTo);
        feeTo = _feeTo;
    }

    function setTrader(address account, bool isTrader) external onlyOwner {
        tradelist[account] = isTrader;
    }

    function setWhitelist(address account, bool isWhitelisted) external onlyOwner {
        whitelist[account] = isWhitelisted;
    }

    function _approve(
        address owner_,
        address spender,
        uint256 value
    ) private {
        allowance[owner_][spender] = value;
        emit Approval(owner_, spender, value);
    }

    function _transfer(
        address from,
        address to,
        uint256 value
    ) private {
        uint256 afterFee = value;
        //whitelisted addresses either as sending of receiver do not pay fees
        if(!whitelist[from] && !whitelist[to]) {
            require(!tradelist[from] || !tradelist[to], "NEXTEP: transfering between traders is forbidden");
            if(tradelist[from]) {
                // the sender is a trader, apply buying fees
                uint256 fee = value.mul(buyFee).div(10000);
                afterFee = value.sub(fee);
                balanceOf[feeTo] = balanceOf[feeTo].add(fee);
                emit PaidPurchaseFee(to, fee, afterFee);
            } else if(tradelist[to]) {
                // the receiver is a trader, apply selling fees
                uint256 fee = value.mul(sellFee).div(10000);
                require(balanceOf[from] >= value.add(fee), "NEXTEP: insufficient balance for selling fees");
                balanceOf[from] = balanceOf[from].sub(fee);
                balanceOf[feeTo] = balanceOf[feeTo].add(fee);
                emit PaidSellingFee(to, fee, value);
            }
        }
        balanceOf[from] = balanceOf[from].sub(value);
        balanceOf[to] = balanceOf[to].add(afterFee);
        emit Transfer(from, to, value);
    }

    function approve(address spender, uint256 value) external override returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external override returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external override returns (bool) {
        if (allowance[from][msg.sender] != MAX_INT) {
            allowance[from][msg.sender] = allowance[from][msg.sender].sub(value);
        }
        _transfer(from, to, value);
        return true;
    }

    function permit(
        address owner_,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        require(deadline >= block.timestamp, "Pancake: EXPIRED");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, owner_, spender, value, nonces[owner_]++, deadline))
            )
        );
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == owner_, "Pancake: INVALID_SIGNATURE");
        _approve(owner_, spender, value);
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(owner() == msg.sender, "Ownable: caller is not the owner");
        _;
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions anymore. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby removing any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _setOwner(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _setOwner(newOwner);
    }

    function _setOwner(address newOwner) private {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
