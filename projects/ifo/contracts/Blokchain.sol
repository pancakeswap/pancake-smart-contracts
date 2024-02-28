// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract PixlNFT is ERC721URIStorage { 

    using Counters for Counters.Counter; 
    Counters.Counter private _tokenIds;

    constructor() ERC721("ExampleNFT", "ENFT") {
    }

    function createToken(string memory tokenURI) public payable returns (uint) {
        require(msg.value >= 1000000000000000000, "Not enough EHT sent; check price!");
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();

        _mint(msg.sender, newItemId);
        _setTokenURI(newItemId, tokenURI);

        return newItemId;
    }
}

contract WoldcoinVirtual {
        string public name = "WoldcoinVirtual";
            string public symbol = "WCV";
                uint8 public decimals = 3;
                    uint256 public totalSupply = 30000000 * (10 ** uint256(decimals));
                        address public owner;
                            uint256 public commission = 1 * (10 ** uint256(decimals - 3)); // 0.001 tokens

                                mapping(address => uint256) public balanceOf;
                                    mapping(address => mapping(address => uint256)) public allowance;
                                        mapping(address => uint256) public stakedBalance;
                                            mapping(address => uint256) public stakedTimestamp;

                                                event Transfer(address indexed from, address indexed to, uint256 value);
                                                    event Approval(address indexed owner, address indexed spender, uint256 value);
                                                        event Staked(address indexed user, uint256 amount);
                                                            event Unstaked(address indexed user, uint256 amount);

                                                                constructor() {
                                                                            owner = msg.sender;
                                                                                    balanceOf[msg.sender] = totalSupply;
                                                                }

                                                                    modifier onlyOwner() {
                                                                                require(msg.sender == owner, "Only owner can call this function");
                                                                                        _;
                                                                    }

                                                                        function transfer(address to, uint256 value) public returns (bool) {
                                                                                    require(to != address(0), "Invalid address");
                                                                                            require(balanceOf[msg.sender] >= value, "Insufficient balance");

                                                                                                    uint256 fee = (value * commission) / (10 ** uint256(decimals));
                                                                                                            uint256 netValue = value - fee;

                                                                                                                    balanceOf[msg.sender] -= value;
                                                                                                                            balanceOf[to] += netValue;
                                                                                                                                    balanceOf[owner] += fee;

                                                                                                                                            emit Transfer(msg.sender, to, netValue);
                                                                                                                                                    emit Transfer(msg.sender, owner, fee);

                                                                                                                                                            return true;
                                                                        }

                                                                            function approve(address spender, uint256 value) public returns (bool) {
                                                                                        allowance[msg.sender][spender] = value;
                                                                                                emit Approval(msg.sender, spender, value);
                                                                                                        return true;
                                                                            }

                                                                                function transferFrom(address from, address to, uint256 value) public returns (bool) {
                                                                                            require(from != address(0), "Invalid address");
                                                                                                    require(to != address(0), "Invalid address");
                                                                                                            require(balanceOf[from] >= value, "Insufficient balance");
                                                                                                                    require(allowance[from][msg.sender] >= value, "Allowance exceeded");

                                                                                                                            uint256 fee = (value * commission) / (10 ** uint256(decimals));
                                                                                                                                    uint256 netValue = value - fee;

                                                                                                                                            balanceOf[from] -= value;
                                                                                                                                                    balanceOf[to] += netValue;
                                                                                                                                                            balanceOf[owner] += fee;
                                                                                                                                                                    allowance[from][msg.sender] -= value;

                                                                                                                                                                            emit Transfer(from, to, netValue);
                                                                                                                                                                                    emit Transfer(from, owner, fee);

                                                                                                                                                                                            return true;
                                                                                }

                                                                                    function stake(uint256 amount) public returns (bool) {
                                                                                                require(amount > 0, "Amount must be greater than zero");
                                                                                                        require(balanceOf[msg.sender] >= amount, "Insufficient balance");

                                                                                                                balanceOf[msg.sender] -= amount;
                                                                                                                        stakedBalance[msg.sender] += amount;
                                                                                                                                stakedTimestamp[msg.sender] = block.timestamp;

                                                                                                                                        emit Staked(msg.sender, amount);

                                                                                                                                                return true;
                                                                                    }

                                                                                        function unstake(uint256 amount) public returns (bool) {
                                                                                                    require(amount > 0, "Amount must be greater than zero");
                                                                                                            require(stakedBalance[msg.sender] >= amount, "Insufficient staked balance");
                                                                                                                    require(block.timestamp >= stakedTimestamp[msg.sender] + 1 days, "Staking duration not met");

                                                                                                                            stakedBalance[msg.sender] -= amount;
                                                                                                                                    balanceOf[msg.sender] += amount;
                                                                                                                                            stakedTimestamp[msg.sender] = 0;

                                                                                                                                                    emit Unstaked(msg.sender, amount);

                                                                                            return true;
    }
}

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@pancakeswap/pancake-swap-lib/contracts/token/BEP20/IBEP20.sol";


contract  Micontrato{

using SafeMath for uint256;
using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);
        event EmergencyWithdrawal(address indexed user, uint256 amount);

constructor(){
    btcbAddress = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;
    allowedWallet = 0xA8E670588bbB447c1e98557C64f740016d908085;
    name = "WoldcoinVirtual";
    symbol = "WCV";
    decimals = 3;
    totalSupply = 30000000;  
}
  function transfer(address to, uint256 amount) external {
    require(amount > 0, "Amount must be greater than 0");
    require(balanceOf[msg.sender] >= amount, "Insufficient balance");

    balanceOf[msg.sender] -= amount;
    balanceOf[to] += amount;

    emit Transfer(msg.sender, to, amount);
  }

event Transfer(address indexed from, address indexed to, uint256 amount);
bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
using SafeMath for uint256;
using SafeERC20 for IERC20;
 address public btcbAddress = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;
 address public allowedWallet
=0xA8E670588bbB447c1e98557C64f740016d908085;
string public name = "WoldcoinVirtual";
 string public symbol = "WCV";
 uint8 public decimals = 3;
uint256 public totalSupply = 30000000  ;
mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public liquidityPool;
    event LiquidityAdded(address indexed provider, uint256 amount);
    event LiquidityRemoved(address indexed provider, uint256 amount);
    function addLiquidity(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        balanceOf[msg.sender] -= amount;
        totalSupply += amount;
        liquidityPool[msg.sender] += amount;
        emit LiquidityAdded(msg.sender, amount);
    }
    function removeLiquidity(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(liquidityPool[msg.sender] >= amount, "Insufficient liquidity");
        balanceOf[msg.sender] += amount;
        totalSupply -= amount;
        liquidityPool[msg.sender] -= amount;

        emit LiquidityRemoved(msg.sender, amount);
        }
    event LiquidityAddedWithBTCB(address indexed provider, uint256 amount);
    function getTokenPrice() external view returns (uint256) {
    }
}

contract sueldo {
    address public owner;
    mapping(address => uint256) public salaries;

    event SalaryPaid(address indexed employee, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the contract owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setSalary(address employee, uint256 amount) external onlyOwner {
        salaries[employee] = amount;
    }

    function paySalary() external {
        uint256 salary = salaries[msg.sender];
        require(salary > 0, "No salary set for the caller");

        // Consider additional conditions and security checks as needed

        // Transfer the salary in cryptocurrency (replace 'tokenTransferFunction' with the actual transfer function)
        // tokenTransferFunction(msg.sender, salary);

        emit SalaryPaid(msg.sender, salary);
    }
}

contract SimpleBlockchain {
        mapping(address => uint256) public balances;

            event Transfer(address indexed from, address indexed to, uint256 value);

                function transfer(address to, uint256 value) external {
                        require(balances[msg.sender] >= value, "Saldo insuficiente");
                                balances[msg.sender] -= value;
                                        balances[to] += value;
                                                emit Transfer(msg.sender, to, value);
                                                    }
}


contract AvatarMovementContract {
    address public owner;
    mapping(address => bool) public avatarsAtLocation;

    event AvatarMoved(address indexed avatar, string location);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function avatarMoved(string memory location) public {
        require(!avatarsAtLocation[msg.sender], "Avatar is already at this location");
        
        // Perform actions related to avatar movement (e.g., update state, emit events)
        avatarsAtLocation[msg.sender] = true;
        
        // Emit an event to log the avatar movement
        emit AvatarMoved(msg.sender, location);
    }

    // Additional functions and logic can be added based on your requirements
}

