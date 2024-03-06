import { ether, time, constants, BN, expectRevert, expectEvent } from "@openzeppelin/test-helpers";
import { advanceBlock, advanceBlockTo } from "@openzeppelin/test-helpers/src/time";
import { artifacts, contract, ethers } from "hardhat";
import { parseEther } from "ethers/lib/utils";
import { BigNumber } from "ethers";
import { assert, expect } from "chai";

const Factory = artifacts.require("PancakeStableSwapFactory");
const StableSwapTwoPool = artifacts.require("PancakeStableSwapTwoPool");
const LPToken = artifacts.require("PancakeStableSwapLP");
const Token = artifacts.require("./test/Token.sol");
const PancakeStableSwapInfo = artifacts.require("./utils/PancakeStableSwapInfo.sol");
const PancakeStableSwapTwoPoolInfo = artifacts.require("./utils/PancakeStableSwapTwoPoolInfo.sol");
const PancakeStableSwapThreePoolInfo = artifacts.require("./utils/PancakeStableSwapThreePoolInfo.sol");
const PancakeStableSwapLPFactory = artifacts.require("PancakeStableSwapLPFactory.sol");
const PancakeStableSwapTwoPoolDeployer = artifacts.require("PancakeStableSwapTwoPoolDeployer.sol");
const PancakeStableSwapThreePoolDeployer = artifacts.require("PancakeStableSwapThreePoolDeployer.sol");

contract("PancakeStableSwapTwoPool", ([admin, user1, user2, admin2, user3, user4]) => {
  let factory,
    swapDeployer,
    swapTriplePoolDeployer,
    LPFactory,
    BUSD,
    USDC,
    swap_BUSD_USDC,
    LP_BUSD_USDC,
    token0,
    token1,
    threePoolInfoSC,
    twoPoolInfoSC,
    poolInfoSC;

  const A = 1000;
  const Fee = 4000000;
  const AdminFee = 5000000000;
  const N_COINS = 2;
  const Slippage = BigNumber.from(99); //0.99
  const SlippageMax = BigNumber.from(10100); //1.01
  const Slippage_PRECISION = BigNumber.from(10000);

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
    BUSD = await Token.new("Binance USD", "BUSD", 18, { from: admin });
    USDC = await Token.new("USD Coin", "USDC", 18, { from: admin });
    await BUSD.mint(user1, parseEther("10000"), { from: user1 });
    await BUSD.mint(user2, parseEther("10000"), { from: user2 });
    await USDC.mint(user1, parseEther("10000"), { from: user1 });
    await USDC.mint(user2, parseEther("10000"), { from: user2 });
    let tx = await factory.createSwapPair(BUSD.address, USDC.address, A, Fee, AdminFee, { from: admin });
    let info = await factory.getPairInfo(BUSD.address, USDC.address);
    swap_BUSD_USDC = await StableSwapTwoPool.at(info.swapContract);
    LP_BUSD_USDC = await LPToken.at(info.LPContract);
    token0 = await Token.at(info.token0);
    token1 = await Token.at(info.token1);
    threePoolInfoSC = await PancakeStableSwapThreePoolInfo.new({ from: admin });
    twoPoolInfoSC = await PancakeStableSwapTwoPoolInfo.new({ from: admin });
    poolInfoSC = await PancakeStableSwapInfo.new(twoPoolInfoSC.address, threePoolInfoSC.address, { from: admin });
  });

  describe("Stable Swap Pair Info", () => {
    it("Check pair info between factory and swap smart contract", async () => {
      let info = await factory.getPairInfo(BUSD.address, USDC.address);
      assert.equal(info.swapContract, swap_BUSD_USDC.address);
      let token0 = await swap_BUSD_USDC.coins(0);
      let token1 = await swap_BUSD_USDC.coins(1);
      let LPToken = await swap_BUSD_USDC.token();
      assert.equal(info.token0, token0);
      assert.equal(info.token1, token1);
      assert.equal(info.LPContract, LPToken);
    });
  });

  describe("User Add Liquidity", () => {
    it("Initialize  liquidity", async () => {
      await BUSD.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await USDC.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });

      await expectRevert(
        swap_BUSD_USDC.add_liquidity([0, parseEther("1")], 0, { from: user1 }),
        "Initial deposit requires all coins"
      );
      await expectRevert(
        swap_BUSD_USDC.add_liquidity([parseEther("1"), 0], 0, { from: user1 }),
        "Initial deposit requires all coins"
      );

      await expectRevert(
        swap_BUSD_USDC.add_liquidity([parseEther("1"), parseEther("1")], parseEther("2.1"), { from: user1 }),
        "Slippage screwed you"
      );

      await expectRevert(
        swap_BUSD_USDC.add_liquidity([parseEther("1"), parseEther("1")], 0, { from: user1, value: ether("1") }),
        "Inconsistent quantity"
      );

      const expect_LP_balance = parseEther("200");
      let tx = await swap_BUSD_USDC.add_liquidity([parseEther("100"), parseEther("100")], expect_LP_balance, {
        from: user1,
      });
      let LP_balance = await LP_BUSD_USDC.balanceOf(user1);
      let LP_totalSupply = await LP_BUSD_USDC.totalSupply();
      assert.equal(expect_LP_balance.toString(), LP_balance.toString());
      assert.equal(LP_totalSupply.toString(), LP_balance.toString());
    });

    it("Add one coin into liquidity ", async () => {
      await BUSD.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await USDC.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await BUSD.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user2 });
      await USDC.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user2 });

      await swap_BUSD_USDC.add_liquidity([parseEther("100"), parseEther("100")], 0, { from: user1 });

      let expect_LP_balance0 = await twoPoolInfoSC.get_add_liquidity_mint_amount(swap_BUSD_USDC.address, [
        parseEther("1"),
        0,
      ]);
      // let expect_LP_balance0 = await swap_BUSD_USDC.calc_token_amount([parseEther("1"), 0], true);
      // expect_LP_balance0 = BigNumber.from(expect_LP_balance0.toString()).mul(Slippage).div(Slippage_PRECISION);
      let token0_balance_before = await swap_BUSD_USDC.balances(0);
      let token1_balance_before = await swap_BUSD_USDC.balances(1);
      let defaultToken0Amount = parseEther("1");
      let liquidityAdminFee = await twoPoolInfoSC.get_add_liquidity_fee(swap_BUSD_USDC.address, [
        defaultToken0Amount,
        0,
      ]);
      await swap_BUSD_USDC.add_liquidity([defaultToken0Amount, 0], expect_LP_balance0, { from: user2 });
      let token0_balance_after = await swap_BUSD_USDC.balances(0);
      let token1_balance_after = await swap_BUSD_USDC.balances(1);
      let realAddToken0 = token0_balance_after.sub(token0_balance_before);
      let realLiquidityToken0AdminFee = BigNumber.from(defaultToken0Amount.toString()).sub(
        BigNumber.from(realAddToken0.toString())
      );
      let realLiquidityToken1AdminFee = token1_balance_before.sub(token1_balance_after);
      // check admin fee
      assert.equal(realLiquidityToken0AdminFee.toString(), liquidityAdminFee[0].toString());
      assert.equal(realLiquidityToken1AdminFee.toString(), liquidityAdminFee[1].toString());
      let LP_balance0 = await LP_BUSD_USDC.balanceOf(user2);
      assert.equal(true, LP_balance0.eq(expect_LP_balance0));

      let expect_LP_balance1 = await swap_BUSD_USDC.calc_token_amount([0, defaultToken0Amount], true);
      expect_LP_balance1 = BigNumber.from(expect_LP_balance1.toString()).mul(Slippage).div(Slippage_PRECISION);
      await swap_BUSD_USDC.add_liquidity([0, defaultToken0Amount], expect_LP_balance1, { from: user2 });
      let LP_balance1 = await LP_BUSD_USDC.balanceOf(user2);
      assert.equal(true, LP_balance1.gt(expect_LP_balance1));
    });
  });

  describe("User Remove Liquidity", () => {
    beforeEach(async () => {
      await BUSD.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await USDC.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await swap_BUSD_USDC.add_liquidity([parseEther("100"), parseEther("100")], 0, { from: user1 });
    });
    it("Remove liquidity", async () => {
      let LP_balance_before = await LP_BUSD_USDC.balanceOf(user1);
      let token0_balance_before = await token0.balanceOf(user1);
      let token1_balance_before = await token1.balanceOf(user1);
      let remove_LP_balance = parseEther("1");
      let expectCoins = await twoPoolInfoSC.calc_coins_amount(swap_BUSD_USDC.address, remove_LP_balance);
      await swap_BUSD_USDC.remove_liquidity(remove_LP_balance, [0, 0], { from: user1 });
      let LP_balance_after = await LP_BUSD_USDC.balanceOf(user1);
      let token0_balance_after = await token0.balanceOf(user1);
      let token1_balance_after = await token1.balanceOf(user1);
      //check lp balance
      assert.equal(LP_balance_before.sub(LP_balance_after).toString(), remove_LP_balance.toString());
      //check check token0 balance
      assert.equal(token0_balance_after.sub(token0_balance_before).toString(), expectCoins[0].toString());
      //check check token1 balance
      assert.equal(token1_balance_after.sub(token1_balance_before).toString(), expectCoins[1].toString());
    });

    it("Remove liquidity imbalance", async () => {
      let user_LP_balance_before = await LP_BUSD_USDC.balanceOf(user1);
      let LP_totalSupply_before = await LP_BUSD_USDC.totalSupply();
      let user_token0_balance_before = await token0.balanceOf(user1);
      let user_token1_balance_before = await token1.balanceOf(user1);
      let swap_token0_balance_before = await swap_BUSD_USDC.balances(0);
      let swap_token1_balance_before = await swap_BUSD_USDC.balances(1);
      let defaultTokenAmount = parseEther("1");
      let remove_token_amounts = [defaultTokenAmount, defaultTokenAmount];
      let liquidityAdminFee = await twoPoolInfoSC.get_remove_liquidity_imbalance_fee(
        swap_BUSD_USDC.address,
        remove_token_amounts
      );
      let max_burn_amount = await swap_BUSD_USDC.calc_token_amount(remove_token_amounts, false);
      max_burn_amount = BigNumber.from(max_burn_amount.toString()).mul(SlippageMax).div(Slippage_PRECISION);
      await swap_BUSD_USDC.remove_liquidity_imbalance(remove_token_amounts, max_burn_amount, { from: user1 });
      let user_LP_balance_after = await LP_BUSD_USDC.balanceOf(user1);
      let LP_totalSupply_after = await LP_BUSD_USDC.totalSupply();
      let user_token0_balance_after = await token0.balanceOf(user1);
      let user_token1_balance_after = await token1.balanceOf(user1);
      let swap_token0_balance_after = await swap_BUSD_USDC.balances(0);
      let swap_token1_balance_after = await swap_BUSD_USDC.balances(1);
      assert.equal(
        defaultTokenAmount.toString(),
        swap_token0_balance_before.sub(swap_token0_balance_after).sub(liquidityAdminFee[0]).toString()
      );
      assert.equal(
        defaultTokenAmount.toString(),
        swap_token1_balance_before.sub(swap_token1_balance_after).sub(liquidityAdminFee[1]).toString()
      );
      assert.equal(
        LP_totalSupply_before.sub(LP_totalSupply_after).toString(),
        user_LP_balance_before.sub(user_LP_balance_after).toString()
      );
      assert.equal(defaultTokenAmount.toString(), user_token0_balance_after.sub(user_token0_balance_before).toString());
      assert.equal(defaultTokenAmount.toString(), user_token1_balance_after.sub(user_token1_balance_before).toString());
      //check fee , swap_token0_balance_before = swap_token0_balance_after + defaultTokenAmount + token0AdminFee
      assert.equal(
        swap_token0_balance_before.toString(),
        BigNumber.from(swap_token0_balance_after.toString())
          .add(BigNumber.from(defaultTokenAmount.toString()))
          .add(BigNumber.from(liquidityAdminFee[0].toString()))
          .toString()
      );
      //check fee , swap_token1_balance_before = swap_token1_balance_after + defaultTokenAmount + token1AdminFee
      assert.equal(
        swap_token1_balance_before.toString(),
        BigNumber.from(swap_token1_balance_after.toString())
          .add(BigNumber.from(defaultTokenAmount.toString()))
          .add(BigNumber.from(liquidityAdminFee[1].toString()))
          .toString()
      );
    });

    it("Remove liquidity one_coin", async () => {
      let defaultTokenAmount = parseEther("1");
      let user_token1_balance_before = await token1.balanceOf(user1);
      let expect_Token1_amount = await swap_BUSD_USDC.calc_withdraw_one_coin(defaultTokenAmount, 1);
      await swap_BUSD_USDC.remove_liquidity_one_coin(defaultTokenAmount, 1, expect_Token1_amount, { from: user1 });
      let user_token1_balance_after = await token1.balanceOf(user1);
      assert(user_token1_balance_after.sub(user_token1_balance_before).toString(), expect_Token1_amount.toString());
    });
  });

  describe("User Exchange", () => {
    beforeEach(async () => {
      await BUSD.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await USDC.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await swap_BUSD_USDC.add_liquidity([parseEther("100"), parseEther("100")], 0, { from: user1 });
    });
    it("Swap token0 to token1", async () => {
      await token0.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user2 });
      let exchange_token0_balance = parseEther("1");
      let expect_token1_balance = await swap_BUSD_USDC.get_dy(0, 1, exchange_token0_balance);
      let cal_dx_amount = await poolInfoSC.get_dx(
        swap_BUSD_USDC.address,
        0,
        1,
        expect_token1_balance,
        parseEther("1000000000")
      );
      //check get_dx
      assert.equal(exchange_token0_balance.toString(), cal_dx_amount.toString());
      let exchangeFees = await twoPoolInfoSC.get_exchange_fee(swap_BUSD_USDC.address, 0, 1, exchange_token0_balance);
      let user_token0_balance_before = await token0.balanceOf(user2);
      let user_token1_balance_before = await token1.balanceOf(user2);
      let swapContract_token1_balance_before = await token1.balanceOf(swap_BUSD_USDC.address);
      let swap_token1_balance_before = await swap_BUSD_USDC.balances(1);
      let token1_admin_fee_before = await swap_BUSD_USDC.admin_balances(1);
      await swap_BUSD_USDC.exchange(0, 1, exchange_token0_balance, expect_token1_balance, { from: user2 });
      let user_token0_balance_after = await token0.balanceOf(user2);
      let token1_admin_fee_after = await swap_BUSD_USDC.admin_balances(1);
      let swapContract_token1_balance_after = await token1.balanceOf(swap_BUSD_USDC.address);
      let swap_token1_balance_after = await swap_BUSD_USDC.balances(1);
      let user_token1_balance_after = await token1.balanceOf(user2);
      //check user token0 balance
      assert.equal(
        exchange_token0_balance.toString(),
        user_token0_balance_before.sub(user_token0_balance_after).toString()
      );
      //check exchange admmin fee
      assert.equal(exchangeFees[1].toString(), token1_admin_fee_after.sub(token1_admin_fee_before).toString());
      //check get_dy
      assert.equal(
        user_token1_balance_after.sub(user_token1_balance_before).toString(),
        expect_token1_balance.toString()
      );
      //check token1 balance
      assert.equal(
        user_token1_balance_after.sub(user_token1_balance_before).toString(),
        swap_token1_balance_before.sub(swap_token1_balance_after).sub(exchangeFees[1]).toString()
      );
      assert.equal(
        user_token1_balance_after.sub(user_token1_balance_before).toString(),
        swapContract_token1_balance_before.sub(swapContract_token1_balance_after).toString()
      );
    });
  });

  describe("Owner operation", () => {
    it("Update A", async () => {
      let future_A = 300;
      let now = await time.latest();
      let MIN_RAMP_TIME = await swap_BUSD_USDC.MIN_RAMP_TIME();
      let future_time = now.add(MIN_RAMP_TIME.mul(new BN(2)));
      let A_before = await swap_BUSD_USDC.A();
      await swap_BUSD_USDC.ramp_A(future_A, future_time);
      let A_after = await swap_BUSD_USDC.A();
      assert.equal(A_before.toString(), String(A));
      assert.equal(A_before.toString(), A_after.toString());
      let targetTime = future_time.add(new BN(2));
      await time.increaseTo(targetTime);
      let A_after_future_time = await swap_BUSD_USDC.A();
      assert.equal(String(future_A), A_after_future_time.toString());
    });

    it("Update Fee", async () => {
      let new_fee = 5000000;
      let new_admin_fee = 6000000000;
      let now = await time.latest();
      let ADMIN_ACTIONS_DELAY = await swap_BUSD_USDC.ADMIN_ACTIONS_DELAY();
      let future_time = now.add(ADMIN_ACTIONS_DELAY);
      let fee_before = await swap_BUSD_USDC.fee();
      let adminFee_before = await swap_BUSD_USDC.admin_fee();
      await swap_BUSD_USDC.commit_new_fee(new_fee, new_admin_fee);
      assert.equal(fee_before.toString(), String(Fee));
      assert.equal(adminFee_before.toString(), String(AdminFee));
      let targetTime = future_time.add(new BN(2));
      await time.increaseTo(targetTime);
      await swap_BUSD_USDC.apply_new_fee();
      let fee_after = await swap_BUSD_USDC.fee();
      let adminFee_after = await swap_BUSD_USDC.admin_fee();
      assert.equal(fee_after.toString(), String(new_fee));
      assert.equal(adminFee_after.toString(), String(new_admin_fee));
    });

    it("Withdraw admin Fee", async () => {
      await BUSD.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await USDC.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await BUSD.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user2 });
      await USDC.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user2 });
      await swap_BUSD_USDC.add_liquidity([parseEther("100"), parseEther("100")], 0, { from: user1 });
      await swap_BUSD_USDC.exchange(0, 1, parseEther("1"), 0, { from: user2 });
      let token0_admin_fee_before = await swap_BUSD_USDC.admin_balances(0);
      let token1_admin_fee_before = await swap_BUSD_USDC.admin_balances(1);
      let token0_admin_balance_before = await token0.balanceOf(admin);
      let token1_admin_balance_before = await token1.balanceOf(admin);
      swap_BUSD_USDC.withdraw_admin_fees({ from: admin });
      let token0_admin_fee_after = await swap_BUSD_USDC.admin_balances(0);
      let token1_admin_fee_after = await swap_BUSD_USDC.admin_balances(1);
      let token0_admin_balance_after = await token0.balanceOf(admin);
      let token1_admin_balance_after = await token1.balanceOf(admin);

      assert.equal(
        token0_admin_fee_before.sub(token0_admin_fee_after).toString(),
        token0_admin_balance_after.sub(token0_admin_balance_before).toString()
      );
      assert.equal(
        token1_admin_fee_before.sub(token1_admin_fee_after).toString(),
        token1_admin_balance_after.sub(token1_admin_balance_before).toString()
      );
    });

    it("Kill me", async () => {
      await BUSD.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await USDC.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await BUSD.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user2 });
      await USDC.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user2 });
      await swap_BUSD_USDC.add_liquidity([parseEther("100"), parseEther("100")], 0, { from: user1 });

      let is_killed_before = await swap_BUSD_USDC.is_killed();
      await swap_BUSD_USDC.kill_me();
      let is_killed_after = await swap_BUSD_USDC.is_killed();
      assert.equal(is_killed_before, false);
      assert.equal(is_killed_after, true);
      try {
        await swap_BUSD_USDC.exchange(0, 1, parseEther("1"), 0);
        expect.fail();
      } catch (e) {
        expect(e.message).to.include("Killed");
      }
      await swap_BUSD_USDC.unkill_me();
      is_killed_after = await swap_BUSD_USDC.is_killed();
      assert.equal(is_killed_after, false);

      let now = await time.latest();
      let KILL_DEADLINE_DT = await swap_BUSD_USDC.KILL_DEADLINE_DT();
      let targetTime = now.add(KILL_DEADLINE_DT).add(new BN(1));
      await time.increaseTo(targetTime);
      try {
        await swap_BUSD_USDC.kill_me();
        expect.fail();
      } catch (e) {
        expect(e.message).to.include("Exceeded deadline");
      }
    });
  });

  describe("Add pair info", () => {
    let factory2, token0, token1, token2;
    beforeEach(async () => {
      let LPFactory2 = await PancakeStableSwapLPFactory.new({ from: admin });
      let swapDeployer2 = await PancakeStableSwapTwoPoolDeployer.new({ from: admin });
      let swapTriplePoolDeployer2 = await PancakeStableSwapThreePoolDeployer.new({ from: admin });
      factory2 = await Factory.new(LPFactory2.address, swapDeployer2.address, swapTriplePoolDeployer2.address, {
        from: admin,
      });
      await LPFactory2.transferOwnership(factory2.address, { from: admin });
      await swapDeployer2.transferOwnership(factory2.address, { from: admin });
      await swapTriplePoolDeployer2.transferOwnership(factory2.address, { from: admin });
    });
    it("addPairInfo", async () => {
      await factory2.addPairInfo(swap_BUSD_USDC.address, { from: admin });
      let pair_info = await factory2.getPairInfo(BUSD.address, USDC.address);
      assert.equal(swap_BUSD_USDC.address, pair_info.swapContract);
      assert.equal(LP_BUSD_USDC.address, pair_info.LPContract);
    });
    it("addTriplePoolPairInfo", async () => {
      token0 = await Token.new("test Token", "TEST", 18, { from: admin });
      token1 = await Token.new("test Token", "TEST", 18, { from: admin });
      token2 = await Token.new("test Token", "TEST", 18, { from: admin });
      //create triple pool
      await factory.createThreePoolPair(token0.address, token1.address, token2.address, A, Fee, AdminFee, {
        from: admin,
      });
      let info_triple_pool = await factory.getThreePoolPairInfo(token0.address, token1.address);
      let swap_triple_pool = await StableSwapTwoPool.at(info_triple_pool.swapContract);
      let LP_triple_pool = await LPToken.at(info_triple_pool.LPContract);

      await factory2.addPairInfo(swap_triple_pool.address, { from: admin });
      let pair_info = await factory2.getThreePoolPairInfo(token0.address, token1.address);
      assert.equal(swap_triple_pool.address, pair_info.swapContract);
      assert.equal(LP_triple_pool.address, pair_info.LPContract);
    });
  });

  describe("The effect of Amplification on swapping", () => {
    let swap_BUSD_USDC_2, LP_BUSD_USDC_2, token0_2, token1_2, BUSD_2, USDC_2;
    let A2 = 300;
    beforeEach(async () => {
      BUSD_2 = await Token.new("Binance USD", "BUSD", 18, { from: admin });
      USDC_2 = await Token.new("USD Coin", "USDC", 18, { from: admin });
      let tx = await factory.createSwapPair(BUSD_2.address, USDC_2.address, A2, Fee, AdminFee, { from: admin });
      let info = await factory.getPairInfo(BUSD_2.address, USDC_2.address);
      swap_BUSD_USDC_2 = await StableSwapTwoPool.at(info.swapContract);
      LP_BUSD_USDC_2 = await LPToken.at(info.LPContract);
      token0_2 = await Token.at(info.token0);
      token1_2 = await Token.at(info.token1);

      await token0.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await token1.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user1 });
      await token0.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user2 });
      await token1.approve(swap_BUSD_USDC.address, parseEther("1000000000"), { from: user2 });

      await token0_2.mint(user3, parseEther("10000"), { from: user3 });
      await token1_2.mint(user3, parseEther("10000"), { from: user3 });
      await token0_2.mint(user4, parseEther("10000"), { from: user4 });
      await token1_2.mint(user4, parseEther("10000"), { from: user4 });

      await token0_2.approve(swap_BUSD_USDC_2.address, parseEther("1000000000"), { from: user3 });
      await token1_2.approve(swap_BUSD_USDC_2.address, parseEther("1000000000"), { from: user3 });
      await token0_2.approve(swap_BUSD_USDC_2.address, parseEther("1000000000"), { from: user4 });
      await token1_2.approve(swap_BUSD_USDC_2.address, parseEther("1000000000"), { from: user4 });
    });
    it("Token0:Token1 = 1:1, A1:A2 = 1000:300", async () => {
      await swap_BUSD_USDC.add_liquidity([parseEther("100"), parseEther("100")], 0, { from: user1 });
      await swap_BUSD_USDC_2.add_liquidity([parseEther("100"), parseEther("100")], 0, { from: user3 });
      let Swap_Token1_Amount = parseEther("1");
      let expect_token1_balance_swap1 = await swap_BUSD_USDC.get_dy(0, 1, Swap_Token1_Amount);
      let expect_token1_balance_swap2 = await swap_BUSD_USDC_2.get_dy(0, 1, Swap_Token1_Amount);
      console.log("A 1000,will get " + expect_token1_balance_swap1.toString());
      console.log("A 300, will get " + expect_token1_balance_swap2.toString());
    });

    it("Token0:Token1 = 1:1,A1:A2 = 1000:3000", async () => {
      let future_A = 3000;
      let now = await time.latest();
      let MIN_RAMP_TIME = await swap_BUSD_USDC_2.MIN_RAMP_TIME();
      let future_time = now.add(MIN_RAMP_TIME).add(new BN(1));
      await swap_BUSD_USDC_2.ramp_A(future_A, future_time);
      let targetTime = future_time.add(new BN(1));
      await time.increaseTo(targetTime);

      await swap_BUSD_USDC.add_liquidity([parseEther("100"), parseEther("100")], 0, { from: user1 });
      await swap_BUSD_USDC_2.add_liquidity([parseEther("100"), parseEther("100")], 0, { from: user3 });
      let Swap_Token1_Amount = parseEther("1");
      let expect_token1_balance_swap1 = await swap_BUSD_USDC.get_dy(0, 1, Swap_Token1_Amount);
      let expect_token1_balance_swap2 = await swap_BUSD_USDC_2.get_dy(0, 1, Swap_Token1_Amount);
      console.log("A 1000,will get " + expect_token1_balance_swap1.toString());
      console.log("A 3000, will get " + expect_token1_balance_swap2.toString());
    });
    it("Token0:Token1 = 2:1, A1:A2 = 1000:300", async () => {
      await swap_BUSD_USDC.add_liquidity([parseEther("100"), parseEther("50")], 0, { from: user1 });
      await swap_BUSD_USDC_2.add_liquidity([parseEther("100"), parseEther("50")], 0, { from: user3 });
      let Swap_Token1_Amount = parseEther("1");
      let expect_token1_balance_swap1 = await swap_BUSD_USDC.get_dy(0, 1, Swap_Token1_Amount);
      let expect_token1_balance_swap2 = await swap_BUSD_USDC_2.get_dy(0, 1, Swap_Token1_Amount);
      console.log("A 1000,will get " + expect_token1_balance_swap1.toString());
      console.log("A 300, will get " + expect_token1_balance_swap2.toString());
    });

    it("Token0:Token1 = 1:2,A1:A2 = 1000:300", async () => {
      await swap_BUSD_USDC.add_liquidity([parseEther("50"), parseEther("100")], 0, { from: user1 });
      await swap_BUSD_USDC_2.add_liquidity([parseEther("50"), parseEther("100")], 0, { from: user3 });
      let Swap_Token1_Amount = parseEther("1");
      let expect_token1_balance_swap1 = await swap_BUSD_USDC.get_dy(0, 1, Swap_Token1_Amount);
      let expect_token1_balance_swap2 = await swap_BUSD_USDC_2.get_dy(0, 1, Swap_Token1_Amount);
      console.log("A 1000,will get " + expect_token1_balance_swap1.toString());
      console.log("A 300, will get " + expect_token1_balance_swap2.toString());
    });
  });
});
