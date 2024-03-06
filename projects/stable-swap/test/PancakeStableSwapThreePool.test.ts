import { ether, time, constants, BN, expectRevert, expectEvent } from "@openzeppelin/test-helpers";
import { advanceBlock, advanceBlockTo } from "@openzeppelin/test-helpers/src/time";
import { artifacts, contract, ethers } from "hardhat";
import { parseEther } from "ethers/lib/utils";
import { BigNumber } from "ethers";
import { assert, expect } from "chai";

const Factory = artifacts.require("PancakeStableSwapFactory");
const StableSwapThreePool = artifacts.require("PancakeStableSwapThreePool");
const LPToken = artifacts.require("PancakeStableSwapLP");
const Token = artifacts.require("./test/Token.sol");
const PancakeStableSwapInfo = artifacts.require("./utils/PancakeStableSwapInfo.sol");
const PancakeStableSwapTwoPoolInfo = artifacts.require("./utils/PancakeStableSwapTwoPoolInfo.sol");
const PancakeStableSwapThreePoolInfo = artifacts.require("./utils/PancakeStableSwapThreePoolInfo.sol");
const PancakeStableSwapLPFactory = artifacts.require("PancakeStableSwapLPFactory.sol");
const PancakeStableSwapTwoPoolDeployer = artifacts.require("PancakeStableSwapTwoPoolDeployer.sol");
const PancakeStableSwapThreePoolDeployer = artifacts.require("PancakeStableSwapThreePoolDeployer.sol");

contract("PancakeStableSwapThreePool", ([admin, user1, user2, admin2, user3, user4]) => {
  let factory,
    swapDeployer,
    swapTriplePoolDeployer,
    LPFactory,
    BUSD,
    USDC,
    USDT,
    swap_BUSD_USDC_USDT,
    LP_BUSD_USDC_USDT,
    token0,
    token1,
    token2,
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
    USDT = await Token.new("Tether USD", "USDT", 18, { from: admin });
    await BUSD.mint(user1, parseEther("10000"), { from: user1 });
    await BUSD.mint(user2, parseEther("10000"), { from: user2 });
    await USDC.mint(user1, parseEther("10000"), { from: user1 });
    await USDC.mint(user2, parseEther("10000"), { from: user2 });
    await USDT.mint(user1, parseEther("10000"), { from: user1 });
    await USDT.mint(user2, parseEther("10000"), { from: user2 });
    let tx = await factory.createThreePoolPair(BUSD.address, USDC.address, USDT.address, A, Fee, AdminFee, {
      from: admin,
    });
    let info = await factory.getThreePoolPairInfo(BUSD.address, USDC.address);
    swap_BUSD_USDC_USDT = await StableSwapThreePool.at(info.swapContract);
    LP_BUSD_USDC_USDT = await LPToken.at(info.LPContract);
    token0 = await Token.at(info.token0);
    token1 = await Token.at(info.token1);
    token2 = await Token.at(info.token2);
    threePoolInfoSC = await PancakeStableSwapThreePoolInfo.new({ from: admin });
    twoPoolInfoSC = await PancakeStableSwapTwoPoolInfo.new({ from: admin });
    poolInfoSC = await PancakeStableSwapInfo.new(twoPoolInfoSC.address, threePoolInfoSC.address, { from: admin });
  });

  describe("Triple Pool Pair Info", () => {
    it("Check triple pool pair info between factory and swap smart contract", async () => {
      let info = await factory.getThreePoolPairInfo(BUSD.address, USDC.address);
      assert.equal(info.swapContract, swap_BUSD_USDC_USDT.address);
      let token0 = await swap_BUSD_USDC_USDT.coins(0);
      let token1 = await swap_BUSD_USDC_USDT.coins(1);
      let token2 = await swap_BUSD_USDC_USDT.coins(2);
      let LPToken = await swap_BUSD_USDC_USDT.token();
      assert.equal(info.token0, token0);
      assert.equal(info.token1, token1);
      assert.equal(info.token2, token2);
      assert.equal(info.LPContract, LPToken);
    });
  });

  describe("User Add Liquidity in triple pool", () => {
    it("Initialize  liquidity", async () => {
      await BUSD.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user1 });
      await USDC.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user1 });
      await USDT.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user1 });

      await expectRevert(
        swap_BUSD_USDC_USDT.add_liquidity([0, parseEther("1"), 0], 0, { from: user1 }),
        "Initial deposit requires all coins"
      );
      await expectRevert(
        swap_BUSD_USDC_USDT.add_liquidity([parseEther("1"), 0, 0], 0, { from: user1 }),
        "Initial deposit requires all coins"
      );

      await expectRevert(
        swap_BUSD_USDC_USDT.add_liquidity([0, 0, parseEther("1")], 0, { from: user1 }),
        "Initial deposit requires all coins"
      );

      await expectRevert(
        swap_BUSD_USDC_USDT.add_liquidity([parseEther("1"), parseEther("1"), parseEther("1")], parseEther("3.1"), {
          from: user1,
        }),
        "Slippage screwed you"
      );

      await expectRevert(
        swap_BUSD_USDC_USDT.add_liquidity([parseEther("1"), parseEther("1"), parseEther("1")], 0, {
          from: user1,
          value: ether("1"),
        }),
        "Inconsistent quantity"
      );

      const expect_LP_balance = parseEther("300");
      let tx = await swap_BUSD_USDC_USDT.add_liquidity(
        [parseEther("100"), parseEther("100"), parseEther("100")],
        expect_LP_balance,
        {
          from: user1,
        }
      );
      let LP_balance = await LP_BUSD_USDC_USDT.balanceOf(user1);
      let LP_totalSupply = await LP_BUSD_USDC_USDT.totalSupply();
      assert.equal(expect_LP_balance.toString(), LP_balance.toString());
      assert.equal(LP_totalSupply.toString(), LP_balance.toString());
    });

    it("Add one coin into liquidity in triple pool ", async () => {
      await BUSD.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user1 });
      await USDC.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user1 });
      await USDT.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user1 });
      await BUSD.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user2 });
      await USDC.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user2 });
      await USDT.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user2 });

      await swap_BUSD_USDC_USDT.add_liquidity([parseEther("100"), parseEther("100"), parseEther("100")], 0, {
        from: user1,
      });

      let expect_LP_balance0 = await threePoolInfoSC.get_add_liquidity_mint_amount(swap_BUSD_USDC_USDT.address, [
        parseEther("1"),
        0,
        0,
      ]);

      let token0_balance_before = await swap_BUSD_USDC_USDT.balances(0);
      let token1_balance_before = await swap_BUSD_USDC_USDT.balances(1);
      let token2_balance_before = await swap_BUSD_USDC_USDT.balances(2);

      let defaultToken0Amount = parseEther("1");
      let liquidityAdminFee = await threePoolInfoSC.get_add_liquidity_fee(swap_BUSD_USDC_USDT.address, [
        defaultToken0Amount,
        0,
        0,
      ]);
      await swap_BUSD_USDC_USDT.add_liquidity([defaultToken0Amount, 0, 0], expect_LP_balance0, { from: user2 });

      let token0_balance_after = await swap_BUSD_USDC_USDT.balances(0);
      let token1_balance_after = await swap_BUSD_USDC_USDT.balances(1);
      let token2_balance_after = await swap_BUSD_USDC_USDT.balances(2);

      let realAddToken0 = token0_balance_after.sub(token0_balance_before);
      let realLiquidityToken0AdminFee = BigNumber.from(defaultToken0Amount.toString()).sub(
        BigNumber.from(realAddToken0.toString())
      );
      let realLiquidityToken1AdminFee = token1_balance_before.sub(token1_balance_after);
      let realLiquidityToken2AdminFee = token2_balance_before.sub(token2_balance_after);
      // check admin fee
      assert.equal(realLiquidityToken0AdminFee.toString(), liquidityAdminFee[0].toString());
      assert.equal(realLiquidityToken1AdminFee.toString(), liquidityAdminFee[1].toString());
      assert.equal(realLiquidityToken2AdminFee.toString(), liquidityAdminFee[2].toString());

      let LP_balance0 = await LP_BUSD_USDC_USDT.balanceOf(user2);
      assert.equal(true, LP_balance0.eq(expect_LP_balance0));

      let expect_LP_balance1 = await swap_BUSD_USDC_USDT.calc_token_amount([0, defaultToken0Amount, 0], true);
      expect_LP_balance1 = BigNumber.from(expect_LP_balance1.toString()).mul(Slippage).div(Slippage_PRECISION);
      await swap_BUSD_USDC_USDT.add_liquidity([0, defaultToken0Amount, 0], expect_LP_balance1, { from: user2 });
      let LP_balance1 = await LP_BUSD_USDC_USDT.balanceOf(user2);
      assert.equal(true, LP_balance1.gt(expect_LP_balance1));
    });
  });

  describe("User Remove Liquidity in triple pool", () => {
    beforeEach(async () => {
      await BUSD.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user1 });
      await USDC.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user1 });
      await USDT.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user1 });
      await swap_BUSD_USDC_USDT.add_liquidity([parseEther("100"), parseEther("100"), parseEther("100")], 0, {
        from: user1,
      });
    });
    it("Remove liquidity in triple pool", async () => {
      let LP_balance_before = await LP_BUSD_USDC_USDT.balanceOf(user1);
      let token0_balance_before = await token0.balanceOf(user1);
      let token1_balance_before = await token1.balanceOf(user1);
      let token2_balance_before = await token2.balanceOf(user1);
      let remove_LP_balance = parseEther("1");
      let expectCoins = await threePoolInfoSC.calc_coins_amount(swap_BUSD_USDC_USDT.address, remove_LP_balance);
      await swap_BUSD_USDC_USDT.remove_liquidity(remove_LP_balance, [0, 0, 0], { from: user1 });
      let LP_balance_after = await LP_BUSD_USDC_USDT.balanceOf(user1);
      let token0_balance_after = await token0.balanceOf(user1);
      let token1_balance_after = await token1.balanceOf(user1);
      let token2_balance_after = await token2.balanceOf(user1);
      //check lp balance
      assert.equal(LP_balance_before.sub(LP_balance_after).toString(), remove_LP_balance.toString());
      //check check token0 balance
      assert.equal(token0_balance_after.sub(token0_balance_before).toString(), expectCoins[0].toString());
      //check check token1 balance
      assert.equal(token1_balance_after.sub(token1_balance_before).toString(), expectCoins[1].toString());
      //check check token2 balance
      assert.equal(token2_balance_after.sub(token2_balance_before).toString(), expectCoins[2].toString());
    });

    it("Remove liquidity imbalance in triple pool", async () => {
      let user_LP_balance_before = await LP_BUSD_USDC_USDT.balanceOf(user1);
      let LP_totalSupply_before = await LP_BUSD_USDC_USDT.totalSupply();

      let user_token0_balance_before = await token0.balanceOf(user1);
      let user_token1_balance_before = await token1.balanceOf(user1);
      let user_token2_balance_before = await token2.balanceOf(user1);

      let swap_token0_balance_before = await swap_BUSD_USDC_USDT.balances(0);
      let swap_token1_balance_before = await swap_BUSD_USDC_USDT.balances(1);
      let swap_token2_balance_before = await swap_BUSD_USDC_USDT.balances(2);

      let defaultTokenAmount = parseEther("1");
      let remove_token_amounts = [defaultTokenAmount, defaultTokenAmount, defaultTokenAmount];
      let liquidityAdminFee = await threePoolInfoSC.get_remove_liquidity_imbalance_fee(
        swap_BUSD_USDC_USDT.address,
        remove_token_amounts
      );
      let max_burn_amount = await swap_BUSD_USDC_USDT.calc_token_amount(remove_token_amounts, false);
      max_burn_amount = BigNumber.from(max_burn_amount.toString()).mul(SlippageMax).div(Slippage_PRECISION);
      await swap_BUSD_USDC_USDT.remove_liquidity_imbalance(remove_token_amounts, max_burn_amount, { from: user1 });
      let user_LP_balance_after = await LP_BUSD_USDC_USDT.balanceOf(user1);
      let LP_totalSupply_after = await LP_BUSD_USDC_USDT.totalSupply();

      let user_token0_balance_after = await token0.balanceOf(user1);
      let user_token1_balance_after = await token1.balanceOf(user1);
      let user_token2_balance_after = await token2.balanceOf(user1);

      let swap_token0_balance_after = await swap_BUSD_USDC_USDT.balances(0);
      let swap_token1_balance_after = await swap_BUSD_USDC_USDT.balances(1);
      let swap_token2_balance_after = await swap_BUSD_USDC_USDT.balances(2);

      assert.equal(
        defaultTokenAmount.toString(),
        swap_token0_balance_before.sub(swap_token0_balance_after).sub(liquidityAdminFee[0]).toString()
      );
      assert.equal(
        defaultTokenAmount.toString(),
        swap_token1_balance_before.sub(swap_token1_balance_after).sub(liquidityAdminFee[1]).toString()
      );
      assert.equal(
        defaultTokenAmount.toString(),
        swap_token2_balance_before.sub(swap_token2_balance_after).sub(liquidityAdminFee[2]).toString()
      );
      assert.equal(
        LP_totalSupply_before.sub(LP_totalSupply_after).toString(),
        user_LP_balance_before.sub(user_LP_balance_after).toString()
      );
      assert.equal(defaultTokenAmount.toString(), user_token0_balance_after.sub(user_token0_balance_before).toString());
      assert.equal(defaultTokenAmount.toString(), user_token1_balance_after.sub(user_token1_balance_before).toString());
      assert.equal(defaultTokenAmount.toString(), user_token2_balance_after.sub(user_token2_balance_before).toString());
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
      //check fee , swap_token1_balance_before = swap_token1_balance_after + defaultTokenAmount + token1AdminFee
      assert.equal(
        swap_token2_balance_before.toString(),
        BigNumber.from(swap_token2_balance_after.toString())
          .add(BigNumber.from(defaultTokenAmount.toString()))
          .add(BigNumber.from(liquidityAdminFee[2].toString()))
          .toString()
      );
    });

    it("Remove liquidity one_coin in triple pool", async () => {
      let defaultTokenAmount = parseEther("1");
      let user_token1_balance_before = await token1.balanceOf(user1);
      let expect_Token1_amount = await swap_BUSD_USDC_USDT.calc_withdraw_one_coin(defaultTokenAmount, 1);
      await swap_BUSD_USDC_USDT.remove_liquidity_one_coin(defaultTokenAmount, 1, expect_Token1_amount, { from: user1 });
      let user_token1_balance_after = await token1.balanceOf(user1);
      assert(user_token1_balance_after.sub(user_token1_balance_before).toString(), expect_Token1_amount.toString());
    });
  });

  describe("User Exchange in triple pool", () => {
    beforeEach(async () => {
      await BUSD.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user1 });
      await USDC.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user1 });
      await USDT.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user1 });
      await swap_BUSD_USDC_USDT.add_liquidity([parseEther("100"), parseEther("100"), parseEther("100")], 0, {
        from: user1,
      });
    });
    it("Swap token0 to token1 in triple pool", async () => {
      await token0.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user2 });
      let exchange_token0_balance = parseEther("1");
      let expect_token1_balance = await swap_BUSD_USDC_USDT.get_dy(0, 1, exchange_token0_balance);
      let cal_dx_amount = await poolInfoSC.get_dx(
        swap_BUSD_USDC_USDT.address,
        0,
        1,
        expect_token1_balance,
        parseEther("1000000000")
      );
      //check get_dx
      assert.equal(exchange_token0_balance.toString(), cal_dx_amount.toString());
      let exchangeFees = await threePoolInfoSC.get_exchange_fee(
        swap_BUSD_USDC_USDT.address,
        0,
        1,
        exchange_token0_balance
      );
      let user_token0_balance_before = await token0.balanceOf(user2);
      let user_token1_balance_before = await token1.balanceOf(user2);
      let swapContract_token1_balance_before = await token1.balanceOf(swap_BUSD_USDC_USDT.address);
      let swap_token1_balance_before = await swap_BUSD_USDC_USDT.balances(1);
      let token1_admin_fee_before = await swap_BUSD_USDC_USDT.admin_balances(1);
      await swap_BUSD_USDC_USDT.exchange(0, 1, exchange_token0_balance, expect_token1_balance, { from: user2 });
      let user_token0_balance_after = await token0.balanceOf(user2);
      let token1_admin_fee_after = await swap_BUSD_USDC_USDT.admin_balances(1);
      let swapContract_token1_balance_after = await token1.balanceOf(swap_BUSD_USDC_USDT.address);
      let swap_token1_balance_after = await swap_BUSD_USDC_USDT.balances(1);
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

    it("Swap token1 to token2 in triple pool", async () => {
      await token1.approve(swap_BUSD_USDC_USDT.address, parseEther("1000000000"), { from: user2 });
      let exchange_token1_balance = parseEther("1");
      let expect_token2_balance = await swap_BUSD_USDC_USDT.get_dy(1, 2, exchange_token1_balance);
      let exchangeFees = await threePoolInfoSC.get_exchange_fee(
        swap_BUSD_USDC_USDT.address,
        1,
        2,
        exchange_token1_balance
      );
      let user_token1_balance_before = await token1.balanceOf(user2);
      let user_token2_balance_before = await token2.balanceOf(user2);
      let swapContract_token2_balance_before = await token2.balanceOf(swap_BUSD_USDC_USDT.address);
      let swap_token2_balance_before = await swap_BUSD_USDC_USDT.balances(2);
      let token2_admin_fee_before = await swap_BUSD_USDC_USDT.admin_balances(2);
      await swap_BUSD_USDC_USDT.exchange(1, 2, exchange_token1_balance, expect_token2_balance, { from: user2 });
      let user_token1_balance_after = await token1.balanceOf(user2);
      let token2_admin_fee_after = await swap_BUSD_USDC_USDT.admin_balances(2);
      let swapContract_token2_balance_after = await token2.balanceOf(swap_BUSD_USDC_USDT.address);
      let swap_token2_balance_after = await swap_BUSD_USDC_USDT.balances(2);
      let user_token2_balance_after = await token2.balanceOf(user2);
      //check user token1 balance
      assert.equal(
        exchange_token1_balance.toString(),
        user_token1_balance_before.sub(user_token1_balance_after).toString()
      );
      //check exchange admmin fee
      assert.equal(exchangeFees[1].toString(), token2_admin_fee_after.sub(token2_admin_fee_before).toString());
      //check get_dy
      assert.equal(
        user_token2_balance_after.sub(user_token2_balance_before).toString(),
        expect_token2_balance.toString()
      );
      //check token2 balance
      assert.equal(
        user_token2_balance_after.sub(user_token2_balance_before).toString(),
        swap_token2_balance_before.sub(swap_token2_balance_after).sub(exchangeFees[1]).toString()
      );
      assert.equal(
        user_token2_balance_after.sub(user_token2_balance_before).toString(),
        swapContract_token2_balance_before.sub(swapContract_token2_balance_after).toString()
      );
    });
  });
});
