import { ether, time, constants, BN, expectRevert, expectEvent, balance } from "@openzeppelin/test-helpers";
import { artifacts, contract, ethers } from "hardhat";
import { parseEther } from "ethers/lib/utils";
import { BigNumber } from "ethers";
import { assert, expect } from "chai";

const Factory = artifacts.require("PancakeStableSwapFactory");
const PancakeStableSwapTwoPool = artifacts.require("PancakeStableSwapTwoPool");
const LPToken = artifacts.require("PancakeStableSwapLP");
const Token = artifacts.require("./test/Token.sol");
const PancakeStableSwapInfo = artifacts.require("./utils/PancakeStableSwapInfo.sol");
const PancakeStableSwapTwoPoolInfo = artifacts.require("./utils/PancakeStableSwapTwoPoolInfo.sol");
const PancakeStableSwapThreePoolInfo = artifacts.require("./utils/PancakeStableSwapThreePoolInfo.sol");
const PancakeStableSwapLPFactory = artifacts.require("PancakeStableSwapLPFactory.sol");
const PancakeStableSwapTwoPoolDeployer = artifacts.require("PancakeStableSwapTwoPoolDeployer.sol");
const PancakeStableSwapThreePoolDeployer = artifacts.require("PancakeStableSwapThreePoolDeployer.sol");

contract("PancakeStableSwapTwoPool", ([admin, user1, user2]) => {
  let factory,
    swapDeployer,
    swapTriplePoolDeployer,
    LPFactory,
    WBNB,
    swap_BNB_WBNB,
    LP_BNB_WBNB,
    BNB_index,
    threePoolInfoSC,
    twoPoolInfoSC,
    poolInfoSC;
  const BNBAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const A = 1000;
  const Fee = 4000000;
  const AdminFee = 5000000000;
  const Slippage = BigNumber.from(99); //0.99
  const SlippageMax = BigNumber.from(10100); //1.01
  const Slippage_PRECISION = BigNumber.from(10000);
  const GasPriceDefault = ether("0.000000001"); // 1 gwei

  beforeEach(async () => {
    LPFactory = await PancakeStableSwapLPFactory.new({ from: admin });
    swapDeployer = await PancakeStableSwapTwoPoolDeployer.new({ from: admin });
    swapTriplePoolDeployer = await PancakeStableSwapThreePoolDeployer.new({ from: admin });
    factory = await Factory.new(LPFactory.address, swapDeployer.address, swapTriplePoolDeployer.address, {
      from: admin,
    });
    await LPFactory.transferOwnership(factory.address, { from: admin });
    await swapDeployer.transferOwnership(factory.address, { from: admin });
    await swapTriplePoolDeployer.transferOwnership(factory.address, { from: admin });
    WBNB = await Token.new("Wrapped BNB", "WBNB", 18, { from: admin });
    await WBNB.mint(user1, parseEther("10000"), { from: user1 });
    await WBNB.mint(user2, parseEther("10000"), { from: user2 });
    let tx = await factory.createSwapPair(WBNB.address, BNBAddress, A, Fee, AdminFee, { from: admin });
    let info = await factory.getPairInfo(WBNB.address, BNBAddress);
    swap_BNB_WBNB = await PancakeStableSwapTwoPool.at(info.swapContract);
    LP_BNB_WBNB = await LPToken.at(info.LPContract);
    if (info.token0 == BNBAddress) {
      BNB_index = 0;
    } else {
      BNB_index = 1;
    }
    threePoolInfoSC = await PancakeStableSwapThreePoolInfo.new({ from: admin });
    twoPoolInfoSC = await PancakeStableSwapTwoPoolInfo.new({ from: admin });
    poolInfoSC = await PancakeStableSwapInfo.new(twoPoolInfoSC.address, threePoolInfoSC.address, { from: admin });
  });

  describe("Stable Swap Pair Info With BNB", () => {
    it("Check pair info between factory and swap smart contract", async () => {
      let info = await factory.getPairInfo(WBNB.address, BNBAddress);
      assert.equal(info.swapContract, swap_BNB_WBNB.address);
      let token0 = await swap_BNB_WBNB.coins(0);
      let token1 = await swap_BNB_WBNB.coins(1);
      let LPToken = await swap_BNB_WBNB.token();
      assert.equal(info.token0, token0);
      assert.equal(info.token1, token1);
      assert.equal(info.LPContract, LPToken);
    });
  });

  describe("User Add Liquidity with BNB", () => {
    it("Initialize  liquidity", async () => {
      await WBNB.approve(swap_BNB_WBNB.address, parseEther("1000000000"), { from: user1 });

      if (BNB_index == 0) {
        await expectRevert(
          swap_BNB_WBNB.add_liquidity([0, parseEther("1")], 0, { from: user1 }),
          "Initial deposit requires all coins"
        );
        await expectRevert(
          swap_BNB_WBNB.add_liquidity([parseEther("1"), 0], 0, { from: user1, value: ether("1") }),
          "Initial deposit requires all coins"
        );

        await expectRevert(
          swap_BNB_WBNB.add_liquidity([parseEther("1"), parseEther("1")], 0, { from: user1, value: ether("0") }),
          "Inconsistent quantity"
        );

        await expectRevert(
          swap_BNB_WBNB.add_liquidity([parseEther("1"), parseEther("1")], 0, { from: user1, value: ether("0.99") }),
          "Inconsistent quantity"
        );

        await expectRevert(
          swap_BNB_WBNB.add_liquidity([parseEther("1"), parseEther("1")], 0, { from: user1, value: ether("1.01") }),
          "Inconsistent quantity"
        );
      } else {
        await expectRevert(
          swap_BNB_WBNB.add_liquidity([0, parseEther("1")], 0, { from: user1, value: ether("1") }),
          "Initial deposit requires all coins"
        );
        await expectRevert(
          swap_BNB_WBNB.add_liquidity([parseEther("1"), 0], 0, { from: user1 }),
          "Initial deposit requires all coins"
        );
      }

      await expectRevert(
        swap_BNB_WBNB.add_liquidity([parseEther("1"), parseEther("1")], parseEther("2.1"), {
          from: user1,
          value: ether("1"),
        }),
        "Slippage screwed you"
      );
      const expect_LP_balance = parseEther("200");
      let tx = await swap_BNB_WBNB.add_liquidity([parseEther("100"), parseEther("100")], expect_LP_balance, {
        from: user1,
        value: ether("100"),
      });
      let LP_balance = await LP_BNB_WBNB.balanceOf(user1);
      let LP_totalSupply = await LP_BNB_WBNB.totalSupply();
      assert.equal(expect_LP_balance.toString(), LP_balance.toString());
      assert.equal(LP_totalSupply.toString(), LP_balance.toString());
    });

    it("Add one coin into liquidity with BNB ", async () => {
      await WBNB.approve(swap_BNB_WBNB.address, parseEther("1000000000"), { from: user1 });
      await WBNB.approve(swap_BNB_WBNB.address, parseEther("1000000000"), { from: user2 });

      await swap_BNB_WBNB.add_liquidity([parseEther("100"), parseEther("100")], 0, {
        from: user1,
        value: ether("100"),
      });

      let expect_LP_balance0 = await twoPoolInfoSC.get_add_liquidity_mint_amount(swap_BNB_WBNB.address, [
        parseEther("1"),
        0,
      ]);

      let token0_balance_before = await swap_BNB_WBNB.balances(0);
      let token1_balance_before = await swap_BNB_WBNB.balances(1);
      let defaultToken0Amount = parseEther("1");
      let liquidityAdminFee = await twoPoolInfoSC.get_add_liquidity_fee(swap_BNB_WBNB.address, [
        defaultToken0Amount,
        0,
      ]);
      if (BNB_index == 0) {
        await swap_BNB_WBNB.add_liquidity([defaultToken0Amount, 0], expect_LP_balance0, {
          from: user2,
          value: ether("1"),
        });
      } else {
        await swap_BNB_WBNB.add_liquidity([defaultToken0Amount, 0], expect_LP_balance0, {
          from: user2,
          value: ether("0"),
        });
      }
      let token0_balance_after = await swap_BNB_WBNB.balances(0);
      let token1_balance_after = await swap_BNB_WBNB.balances(1);
      let realAddToken0 = token0_balance_after.sub(token0_balance_before);
      let realLiquidityToken0AdminFee = BigNumber.from(defaultToken0Amount.toString()).sub(
        BigNumber.from(realAddToken0.toString())
      );
      let realLiquidityToken1AdminFee = token1_balance_before.sub(token1_balance_after);
      // check admin fee
      assert.equal(realLiquidityToken0AdminFee.toString(), liquidityAdminFee[0].toString());
      assert.equal(realLiquidityToken1AdminFee.toString(), liquidityAdminFee[1].toString());
      let LP_balance0 = await LP_BNB_WBNB.balanceOf(user2);
      assert.equal(true, LP_balance0.eq(expect_LP_balance0));

      let expect_LP_balance1 = await swap_BNB_WBNB.calc_token_amount([0, defaultToken0Amount], true);
      expect_LP_balance1 = BigNumber.from(expect_LP_balance1.toString()).mul(Slippage).div(Slippage_PRECISION);
      if (BNB_index == 0) {
        await swap_BNB_WBNB.add_liquidity([0, defaultToken0Amount], expect_LP_balance1, {
          from: user2,
          value: ether("0"),
        });
      } else {
        await swap_BNB_WBNB.add_liquidity([0, defaultToken0Amount], expect_LP_balance1, {
          from: user2,
          value: ether("1"),
        });
      }
      let LP_balance1 = await LP_BNB_WBNB.balanceOf(user2);
      assert.equal(true, LP_balance1.gt(expect_LP_balance1));
    });
  });

  describe("User Remove Liquidity with BNB", () => {
    beforeEach(async () => {
      await WBNB.approve(swap_BNB_WBNB.address, parseEther("1000000000"), { from: user1 });
      await swap_BNB_WBNB.add_liquidity([parseEther("100"), parseEther("100")], 0, {
        from: user1,
        value: ether("100"),
      });
    });
    it("Remove liquidity with BNB", async () => {
      let LP_balance_before = await LP_BNB_WBNB.balanceOf(user1);
      let wbnb_balance_before = await WBNB.balanceOf(user1);
      let bnb_balance_before = await balance.current(user1);
      let remove_LP_balance = parseEther("1");
      let expectCoins = await twoPoolInfoSC.calc_coins_amount(swap_BNB_WBNB.address, remove_LP_balance);
      let tx = await swap_BNB_WBNB.remove_liquidity(remove_LP_balance, [0, 0], {
        from: user1,
        gasPrice: GasPriceDefault,
      });
      let gasUsed = new BN(tx.receipt.gasUsed.toString()).mul(GasPriceDefault);
      let LP_balance_after = await LP_BNB_WBNB.balanceOf(user1);
      let wbnb_balance_after = await WBNB.balanceOf(user1);
      let bnb_balance_after = await balance.current(user1);
      //check lp balance
      assert.equal(LP_balance_before.sub(LP_balance_after).toString(), remove_LP_balance.toString());
      //check check token0 balance
      assert.equal(wbnb_balance_after.sub(wbnb_balance_before).toString(), expectCoins[0].toString());
      //check check token1 balance
      assert.equal(bnb_balance_after.sub(bnb_balance_before).toString(), expectCoins[1].sub(gasUsed).toString());
    });

    it("Remove liquidity imbalance with BNB", async () => {
      let user_LP_balance_before = await LP_BNB_WBNB.balanceOf(user1);
      let LP_totalSupply_before = await LP_BNB_WBNB.totalSupply();
      let user_wbnb_balance_before = await WBNB.balanceOf(user1);
      let user_bnb_balance_before = await balance.current(user1);
      let swap_wbnb_balance_before;
      let swap_bnb_balance_before;
      if (BNB_index == 0) {
        swap_wbnb_balance_before = await swap_BNB_WBNB.balances(1);
        swap_bnb_balance_before = await swap_BNB_WBNB.balances(0);
      } else {
        swap_wbnb_balance_before = await swap_BNB_WBNB.balances(0);
        swap_bnb_balance_before = await swap_BNB_WBNB.balances(1);
      }
      let defaultTokenAmount = parseEther("1");
      let remove_token_amounts = [defaultTokenAmount, defaultTokenAmount];
      let liquidityAdminFee = await twoPoolInfoSC.get_remove_liquidity_imbalance_fee(
        swap_BNB_WBNB.address,
        remove_token_amounts
      );
      let max_burn_amount = await swap_BNB_WBNB.calc_token_amount(remove_token_amounts, false);
      max_burn_amount = BigNumber.from(max_burn_amount.toString()).mul(SlippageMax).div(Slippage_PRECISION);
      let tx = await swap_BNB_WBNB.remove_liquidity_imbalance(remove_token_amounts, max_burn_amount, {
        from: user1,
        gasPrice: GasPriceDefault,
      });
      let gasUsed = new BN(tx.receipt.gasUsed.toString()).mul(GasPriceDefault);
      let user_LP_balance_after = await LP_BNB_WBNB.balanceOf(user1);
      let LP_totalSupply_after = await LP_BNB_WBNB.totalSupply();
      let user_wbnb_balance_after = await WBNB.balanceOf(user1);
      let user_bnb_balance_after = await balance.current(user1);
      let swap_wbnb_balance_after;
      let swap_bnb_balance_after;
      if (BNB_index == 0) {
        swap_wbnb_balance_after = await swap_BNB_WBNB.balances(1);
        swap_bnb_balance_after = await swap_BNB_WBNB.balances(0);
      } else {
        swap_wbnb_balance_after = await swap_BNB_WBNB.balances(0);
        swap_bnb_balance_after = await swap_BNB_WBNB.balances(1);
      }
      assert.equal(
        defaultTokenAmount.toString(),
        swap_wbnb_balance_before.sub(swap_wbnb_balance_after).sub(liquidityAdminFee[0]).toString()
      );
      assert.equal(
        defaultTokenAmount.toString(),
        swap_bnb_balance_before.sub(swap_bnb_balance_after).sub(liquidityAdminFee[1]).toString()
      );
      assert.equal(
        LP_totalSupply_before.sub(LP_totalSupply_after).toString(),
        user_LP_balance_before.sub(user_LP_balance_after).toString()
      );
      assert.equal(defaultTokenAmount.toString(), user_wbnb_balance_after.sub(user_wbnb_balance_before).toString());
      assert.equal(
        defaultTokenAmount.toString(),
        user_bnb_balance_after.sub(user_bnb_balance_before).add(gasUsed).toString()
      );
      //check fee , swap_token0_balance_before = swap_token0_balance_after + defaultTokenAmount + token0AdminFee
      assert.equal(
        swap_wbnb_balance_before.toString(),
        BigNumber.from(swap_wbnb_balance_after.toString())
          .add(BigNumber.from(defaultTokenAmount.toString()))
          .add(BigNumber.from(liquidityAdminFee[0].toString()))
          .toString()
      );
      //check fee , swap_token1_balance_before = swap_token1_balance_after + defaultTokenAmount + token1AdminFee
      assert.equal(
        swap_bnb_balance_before.toString(),
        BigNumber.from(swap_bnb_balance_after.toString())
          .add(BigNumber.from(defaultTokenAmount.toString()))
          .add(BigNumber.from(liquidityAdminFee[1].toString()))
          .toString()
      );
    });

    it("Remove liquidity one_coin with BNB", async () => {
      let defaultTokenAmount = parseEther("1");
      let user_token1_balance_before = await balance.current(user1);
      let expect_Token1_amount = await swap_BNB_WBNB.calc_withdraw_one_coin(defaultTokenAmount, 1);
      let tx;
      if (BNB_index == 0) {
        tx = await swap_BNB_WBNB.remove_liquidity_one_coin(defaultTokenAmount, 0, expect_Token1_amount, {
          from: user1,
          gasPrice: GasPriceDefault,
        });
      } else {
        tx = await swap_BNB_WBNB.remove_liquidity_one_coin(defaultTokenAmount, 1, expect_Token1_amount, {
          from: user1,
          gasPrice: GasPriceDefault,
        });
      }
      let gasUsed = new BN(tx.receipt.gasUsed.toString()).mul(GasPriceDefault);
      let user_token1_balance_after = await balance.current(user1);
      assert(
        user_token1_balance_after.sub(user_token1_balance_before).add(gasUsed).toString(),
        expect_Token1_amount.toString()
      );
    });
  });

  describe("User Exchange with BNB", () => {
    beforeEach(async () => {
      await WBNB.approve(swap_BNB_WBNB.address, parseEther("1000000000"), { from: user1 });
      await swap_BNB_WBNB.add_liquidity([parseEther("100"), parseEther("100")], 0, {
        from: user1,
        value: ether("100"),
      });
    });
    it("Swap wbnb to bnb", async () => {
      await WBNB.approve(swap_BNB_WBNB.address, parseEther("1000000000"), { from: user2 });
      let exchange_wbnb_balance = parseEther("1");
      let expect_bnb_balance;
      let exchangeFees;
      if (BNB_index == 0) {
        expect_bnb_balance = await swap_BNB_WBNB.get_dy(1, 0, exchange_wbnb_balance);
        exchangeFees = await twoPoolInfoSC.get_exchange_fee(swap_BNB_WBNB.address, 1, 0, exchange_wbnb_balance);
      } else {
        expect_bnb_balance = await swap_BNB_WBNB.get_dy(0, 1, exchange_wbnb_balance);
        exchangeFees = await twoPoolInfoSC.get_exchange_fee(swap_BNB_WBNB.address, 0, 1, exchange_wbnb_balance);
      }

      let user_wbnb_balance_before;
      let user_bnb_balance_before;
      user_wbnb_balance_before = await WBNB.balanceOf(user2);
      user_bnb_balance_before = await balance.current(user2);

      let swapContract_bnb_balance_before = await balance.current(swap_BNB_WBNB.address);

      let swap_bnb_balance_before;
      if (BNB_index == 0) {
        swap_bnb_balance_before = await swap_BNB_WBNB.balances(0);
      } else {
        swap_bnb_balance_before = await swap_BNB_WBNB.balances(1);
      }

      let bnb_admin_fee_before;
      if (BNB_index == 0) {
        bnb_admin_fee_before = await swap_BNB_WBNB.admin_balances(0);
      } else {
        bnb_admin_fee_before = await swap_BNB_WBNB.admin_balances(1);
      }
      let tx;
      if (BNB_index == 0) {
        tx = await swap_BNB_WBNB.exchange(1, 0, exchange_wbnb_balance, expect_bnb_balance, {
          from: user2,
          gasPrice: GasPriceDefault,
        });
      } else {
        tx = await swap_BNB_WBNB.exchange(0, 1, exchange_wbnb_balance, expect_bnb_balance, {
          from: user2,
          gasPrice: GasPriceDefault,
        });
      }
      let gasUsed = new BN(tx.receipt.gasUsed.toString()).mul(GasPriceDefault);

      let bnb_admin_fee_after;
      if (BNB_index == 0) {
        bnb_admin_fee_after = await swap_BNB_WBNB.admin_balances(0);
      } else {
        bnb_admin_fee_after = await swap_BNB_WBNB.admin_balances(1);
      }

      let swapContract_bnb_balance_after = await balance.current(swap_BNB_WBNB.address);

      let swap_bnb_balance_after;
      if (BNB_index == 0) {
        swap_bnb_balance_after = await swap_BNB_WBNB.balances(0);
      } else {
        swap_bnb_balance_after = await swap_BNB_WBNB.balances(1);
      }
      let user_wbnb_balance_after;
      let user_bnb_balance_after;
      user_wbnb_balance_after = await WBNB.balanceOf(user2);
      user_bnb_balance_after = await balance.current(user2);
      //check user wbnb balance
      assert.equal(exchange_wbnb_balance.toString(), user_wbnb_balance_before.sub(user_wbnb_balance_after).toString());
      //check exchange admmin fee
      assert.equal(exchangeFees[1].toString(), bnb_admin_fee_after.sub(bnb_admin_fee_before).toString());
      //check get_dy
      assert.equal(
        user_bnb_balance_after.sub(user_bnb_balance_before).add(gasUsed).toString(),
        expect_bnb_balance.toString()
      );
      //check bnb balance
      assert.equal(
        user_bnb_balance_after.sub(user_bnb_balance_before).add(gasUsed).toString(),
        swap_bnb_balance_before.sub(swap_bnb_balance_after).sub(exchangeFees[1]).toString()
      );
      assert.equal(
        user_bnb_balance_after.sub(user_bnb_balance_before).add(gasUsed).toString(),
        swapContract_bnb_balance_before.sub(swapContract_bnb_balance_after).toString()
      );
    });

    it("Swap bnb to wbnb", async () => {
      let exchange_bnb_balance = parseEther("1");
      let expect_wbnb_balance;
      let exchangeFees;
      if (BNB_index == 0) {
        expect_wbnb_balance = await swap_BNB_WBNB.get_dy(0, 1, exchange_bnb_balance);
        exchangeFees = await twoPoolInfoSC.get_exchange_fee(swap_BNB_WBNB.address, 0, 1, exchange_bnb_balance);
      } else {
        expect_wbnb_balance = await swap_BNB_WBNB.get_dy(1, 0, exchange_bnb_balance);
        exchangeFees = await twoPoolInfoSC.get_exchange_fee(swap_BNB_WBNB.address, 1, 0, exchange_bnb_balance);
      }

      let user_wbnb_balance_before;
      let user_bnb_balance_before;
      user_wbnb_balance_before = await WBNB.balanceOf(user2);
      user_bnb_balance_before = await balance.current(user2);

      let swapContract_bnb_balance_before = await balance.current(swap_BNB_WBNB.address);

      let swap_wbnb_balance_before;
      let swap_bnb_balance_before;
      if (BNB_index == 0) {
        swap_wbnb_balance_before = await swap_BNB_WBNB.balances(1);
        swap_bnb_balance_before = await swap_BNB_WBNB.balances(0);
      } else {
        swap_wbnb_balance_before = await swap_BNB_WBNB.balances(0);
        swap_bnb_balance_before = await swap_BNB_WBNB.balances(1);
      }

      assert.equal(swapContract_bnb_balance_before.toString(), swap_bnb_balance_before.toString());

      let wbnb_admin_fee_before;
      if (BNB_index == 0) {
        wbnb_admin_fee_before = await swap_BNB_WBNB.admin_balances(1);
      } else {
        wbnb_admin_fee_before = await swap_BNB_WBNB.admin_balances(0);
      }
      let tx;
      if (BNB_index == 0) {
        tx = await swap_BNB_WBNB.exchange(0, 1, exchange_bnb_balance, expect_wbnb_balance, {
          from: user2,
          gasPrice: GasPriceDefault,
          value: exchange_bnb_balance,
        });
      } else {
        tx = await swap_BNB_WBNB.exchange(1, 0, exchange_bnb_balance, expect_wbnb_balance, {
          from: user2,
          gasPrice: GasPriceDefault,
          value: exchange_bnb_balance,
        });
      }
      let gasUsed = new BN(tx.receipt.gasUsed.toString()).mul(GasPriceDefault);

      let wbnb_admin_fee_after;
      if (BNB_index == 0) {
        wbnb_admin_fee_after = await swap_BNB_WBNB.admin_balances(1);
      } else {
        wbnb_admin_fee_after = await swap_BNB_WBNB.admin_balances(0);
      }

      let swapContract_bnb_balance_after = await balance.current(swap_BNB_WBNB.address);

      let swap_wbnb_balance_after;
      let swap_bnb_balance_after;
      if (BNB_index == 0) {
        swap_wbnb_balance_after = await swap_BNB_WBNB.balances(1);
        swap_bnb_balance_after = await swap_BNB_WBNB.balances(0);
      } else {
        swap_wbnb_balance_after = await swap_BNB_WBNB.balances(0);
        swap_bnb_balance_after = await swap_BNB_WBNB.balances(1);
      }

      assert.equal(swapContract_bnb_balance_after.toString(), swap_bnb_balance_after.toString());

      let user_wbnb_balance_after;
      let user_bnb_balance_after;
      user_wbnb_balance_after = await WBNB.balanceOf(user2);
      user_bnb_balance_after = await balance.current(user2);
      //check user bnb balance
      assert.equal(
        exchange_bnb_balance.toString(),
        user_bnb_balance_before.sub(user_bnb_balance_after).sub(gasUsed).toString()
      );
      //check exchange admmin fee
      assert.equal(exchangeFees[1].toString(), wbnb_admin_fee_after.sub(wbnb_admin_fee_before).toString());
      //check get_dy
      assert.equal(user_wbnb_balance_after.sub(user_wbnb_balance_before).toString(), expect_wbnb_balance.toString());
      //check wbnb balance
      assert.equal(
        user_wbnb_balance_after.sub(user_wbnb_balance_before).toString(),
        swap_wbnb_balance_before.sub(swap_wbnb_balance_after).sub(exchangeFees[1]).toString()
      );
      assert.equal(
        user_bnb_balance_after.sub(user_bnb_balance_before).add(gasUsed).toString(),
        swapContract_bnb_balance_before.sub(swapContract_bnb_balance_after).toString()
      );
    });
  });
});
