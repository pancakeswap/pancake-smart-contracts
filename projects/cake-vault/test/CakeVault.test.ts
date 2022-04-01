import { artifacts, contract } from "hardhat";
import { ether, time, constants, BN, expectRevert, expectEvent } from "@openzeppelin/test-helpers";
import { assert } from "chai";

const CakeToken = artifacts.require("CakeToken");
const SyrupBar = artifacts.require("SyrupBar");
const MasterChef = artifacts.require("MasterChef");
const CakeVault = artifacts.require("CakeVault");
const VaultOwner = artifacts.require("VaultOwner");
const MockERC20 = artifacts.require("MockERC20");

const REWARDS_START_BLOCK = 100;

contract("CakeVault", ([owner, admin, treasury, user1, user2, user3, harvester]) => {
  let vault, masterchef, cake, syrup, rewardsStartBlock;
  let user1Shares, user2Shares, user3Shares;
  let pricePerFullShare;

  async function zeroFeesSetup() {
    // Set fees to zero
    await vault.setPerformanceFee(0, { from: admin });
    await vault.setCallFee(0, { from: admin });
    await vault.setWithdrawFee(0, { from: admin });
  }

  async function getUserInfo(user: any) {
    const userInfo = await vault.userInfo(user);
    return {
      shares: userInfo[0],
      lastDepositedTime: userInfo[1],
      cakeAtLastUserAction: userInfo[2],
      lastUserActionTime: userInfo[3],
    };
  }

  beforeEach(async () => {
    rewardsStartBlock = (await time.latestBlock()).toNumber() + REWARDS_START_BLOCK;
    cake = await CakeToken.new({ from: owner });
    syrup = await SyrupBar.new(cake.address, { from: owner });
    masterchef = await MasterChef.new(cake.address, syrup.address, owner, ether("1"), rewardsStartBlock, {
      from: owner,
    }); // 1 cake per block, starts at +100 block of each test
    vault = await CakeVault.new(cake.address, syrup.address, masterchef.address, admin, treasury, { from: owner });

    await cake.mint(user1, ether("100"), { from: owner });
    await cake.mint(user2, ether("100"), { from: owner });
    await cake.mint(user3, ether("100"), { from: owner });
    await cake.approve(vault.address, ether("1000"), { from: user1 });
    await cake.approve(vault.address, ether("1000"), { from: user2 });
    await cake.approve(vault.address, ether("1000"), { from: user3 });
    await cake.transferOwnership(masterchef.address, { from: owner });
    await syrup.transferOwnership(masterchef.address, { from: owner });
  });

  it("Initialize", async () => {
    assert.equal(await cake.balanceOf(vault.address), 0);
    assert.equal(await cake.balanceOf(vault.address), 0);
    assert.equal(await vault.token(), cake.address);
    assert.equal(await vault.masterchef(), masterchef.address);
    assert.equal(await vault.owner(), owner);
    assert.equal(await vault.admin(), admin);
    assert.equal(await vault.treasury(), treasury);
    assert.equal((await vault.performanceFee()).toString(), "200"); // default, 2%
    assert.equal((await vault.callFee()).toString(), "25"); // default, 0.25%
    assert.equal((await vault.withdrawFee()).toString(), "10"); // default, 0.1%
    assert.equal((await vault.withdrawFeePeriod()).toString(), time.duration.hours(72).toString()); // default, 72 hours
    assert.equal(await vault.totalShares(), 0);
    assert.equal(await vault.balanceOf(), 0);
    assert.equal(await vault.available(), 0);
    assert.equal(await vault.getPricePerFullShare(), ether("1").toString());
  });

  it("Setters assign as intended", async () => {
    await expectRevert(vault.setPerformanceFee(9999), "admin: wut?");
    await expectRevert(
      vault.setPerformanceFee(9999, { from: admin }),
      "performanceFee cannot be more than MAX_PERFORMANCE_FEE"
    );
    await vault.setPerformanceFee(99, { from: admin });
    assert.equal((await vault.performanceFee()).toString(), "99");

    await expectRevert(vault.setCallFee(9999), "admin: wut?");
    await expectRevert(vault.setCallFee(9999, { from: admin }), "callFee cannot be more than MAX_CALL_FEE");
    await vault.setCallFee(99, { from: admin });
    assert.equal((await vault.callFee()).toString(), "99");

    await expectRevert(vault.setWithdrawFee(9999), "admin: wut?");
    await expectRevert(vault.setWithdrawFee(9999, { from: admin }), "withdrawFee cannot be more than MAX_WITHDRAW_FEE");
    await vault.setWithdrawFee(99, { from: admin });
    assert.equal((await vault.withdrawFee()).toString(), "99");

    await expectRevert(vault.setWithdrawFeePeriod(time.duration.hours(99)), "admin: wut?");
    await expectRevert(
      vault.setWithdrawFeePeriod(time.duration.hours(99), { from: admin }),
      "withdrawFeePeriod cannot be more than MAX_WITHDRAW_FEE_PERIOD"
    );
    await vault.setWithdrawFeePeriod(time.duration.hours(9), { from: admin });
    assert.equal((await vault.withdrawFeePeriod()).toString(), time.duration.hours(9).toString());

    await expectRevert(vault.setAdmin(user1, { from: admin }), "Ownable: caller is not the owner");
    await expectRevert(vault.setAdmin(constants.ZERO_ADDRESS, { from: owner }), "Cannot be zero address");
    await vault.setAdmin(user1, { from: owner });
    assert.equal(await vault.admin(), user1);

    await expectRevert(vault.setTreasury(user1, { from: admin }), "Ownable: caller is not the owner");
    await expectRevert(vault.setTreasury(constants.ZERO_ADDRESS, { from: owner }), "Cannot be zero address");
    await vault.setTreasury(user1, { from: owner });
    assert.equal(await vault.treasury(), user1);
  });

  it("Should deposit funds, withdraw funds and get shares without rewards", async () => {
    await zeroFeesSetup();

    assert.equal((await cake.balanceOf(user1)).toString(), ether("100").toString());
    assert.equal((await cake.balanceOf(user2)).toString(), ether("100").toString());
    assert.equal((await cake.balanceOf(user3)).toString(), ether("100").toString());

    await vault.deposit(ether("10"), { from: user1 });
    await vault.deposit(ether("20"), { from: user2 });
    await vault.deposit(await cake.balanceOf(user3), { from: user3 });

    // Rewards not started yet, so no rewards are earned, so all ratios should be 1:1
    // 1 share should equal to 1 cake, pricePerFullShare should equal to 1
    let user1Shares = (await getUserInfo(user1)).shares;
    let user2Shares = (await getUserInfo(user2)).shares;
    let user3Shares = (await getUserInfo(user3)).shares;

    let user1Cake = (await getUserInfo(user1)).cakeAtLastUserAction;
    let user2Cake = (await getUserInfo(user2)).cakeAtLastUserAction;
    let user3Cake = (await getUserInfo(user3)).cakeAtLastUserAction;

    let pricePerFullShare = await vault.getPricePerFullShare();

    assert.equal(pricePerFullShare.toString(), ether("1").toString());
    assert.equal(user1Shares.toString(), ether("10").toString());
    assert.equal(user2Shares.toString(), ether("20").toString());
    assert.equal(user3Shares.toString(), ether("100").toString());

    assert.equal(user1Shares.mul(pricePerFullShare).div(ether("1")).toString(), ether("10").toString());
    assert.equal(user2Shares.mul(pricePerFullShare).div(ether("1")).toString(), ether("20").toString());
    assert.equal(user3Shares.mul(pricePerFullShare).div(ether("1")).toString(), ether("100").toString());

    assert.equal(user1Cake.toString(), ether("10").toString());
    assert.equal(user2Cake.toString(), ether("20").toString());
    assert.equal(user3Cake.toString(), ether("100").toString());

    assert.equal((await vault.available()).toString(), ether("0").toString());
    assert.equal((await vault.balanceOf()).toString(), ether("130").toString());
    assert.equal((await vault.totalShares()).toString(), ether("130").toString());
    assert.equal((await cake.balanceOf(user1)).toString(), ether("90").toString());
    assert.equal((await cake.balanceOf(user2)).toString(), ether("80").toString());
    assert.equal((await cake.balanceOf(user3)).toString(), ether("0").toString());

    // Repeated deposit
    await vault.deposit(ether("10"), { from: user1 });
    await vault.deposit(ether("20"), { from: user2 });

    user1Shares = (await getUserInfo(user1)).shares;
    user2Shares = (await getUserInfo(user2)).shares;
    user3Shares = (await getUserInfo(user3)).shares;
    pricePerFullShare = await vault.getPricePerFullShare();
    assert.equal(pricePerFullShare.toString(), ether("1").toString());
    assert.equal(user1Shares.toString(), ether("20").toString());
    assert.equal(user2Shares.toString(), ether("40").toString());
    assert.equal(user3Shares.toString(), ether("100").toString());
    assert.equal(user1Shares.mul(pricePerFullShare).div(ether("1")).toString(), ether("20").toString()); // Convert 1e18 to 1
    assert.equal(user2Shares.mul(pricePerFullShare).div(ether("1")).toString(), ether("40").toString());
    assert.equal(user3Shares.mul(pricePerFullShare).div(ether("1")).toString(), ether("100").toString());

    assert.equal((await vault.available()).toString(), ether("0").toString());
    assert.equal((await vault.balanceOf()).toString(), ether("160").toString());
    assert.equal((await vault.totalShares()).toString(), ether("160").toString());
    assert.equal((await cake.balanceOf(user1)).toString(), ether("80").toString());
    assert.equal((await cake.balanceOf(user2)).toString(), ether("60").toString());
    assert.equal((await cake.balanceOf(user3)).toString(), ether("0").toString());

    // Partial withdraw
    await vault.withdraw(ether("10"), { from: user1 });
    await vault.withdraw(ether("20"), { from: user2 });

    user1Shares = (await getUserInfo(user1)).shares;
    user2Shares = (await getUserInfo(user2)).shares;
    user3Shares = (await getUserInfo(user3)).shares;
    pricePerFullShare = await vault.getPricePerFullShare();
    assert.equal(pricePerFullShare.toString(), ether("1").toString());
    assert.equal(user1Shares.toString(), ether("10").toString());
    assert.equal(user2Shares.toString(), ether("20").toString());
    assert.equal(user3Shares.toString(), ether("100").toString());
    assert.equal(user1Shares.mul(pricePerFullShare).div(ether("1")).toString(), ether("10").toString()); // Convert 1e18 to 1
    assert.equal(user2Shares.mul(pricePerFullShare).div(ether("1")).toString(), ether("20").toString());
    assert.equal(user3Shares.mul(pricePerFullShare).div(ether("1")).toString(), ether("100").toString());

    assert.equal((await vault.balanceOf()).toString(), ether("130").toString());
    assert.equal((await vault.available()).toString(), ether("0").toString());
    assert.equal((await vault.totalShares()).toString(), ether("130").toString());
    assert.equal((await cake.balanceOf(user1)).toString(), ether("90").toString());
    assert.equal((await cake.balanceOf(user2)).toString(), ether("80").toString());
    assert.equal((await cake.balanceOf(user3)).toString(), ether("0").toString());

    // Full withdraw
    await vault.withdraw(ether("10"), { from: user1 });
    await vault.withdraw(ether("20"), { from: user2 });
    await vault.withdrawAll({ from: user3 });

    pricePerFullShare = await vault.getPricePerFullShare();
    assert.equal(pricePerFullShare.toString(), ether("1").toString());
    assert.equal((await getUserInfo(user1)).shares, 0);
    assert.equal((await getUserInfo(user2)).shares, 0);
    assert.equal((await getUserInfo(user3)).shares, 0);
    assert.equal((await getUserInfo(user1)).cakeAtLastUserAction, 0);
    assert.equal((await getUserInfo(user2)).cakeAtLastUserAction, 0);
    assert.equal((await getUserInfo(user3)).cakeAtLastUserAction, 0);

    assert.equal(await vault.balanceOf(), 0);
    assert.equal(await vault.available(), 0);
    assert.equal(await vault.totalShares(), 0);
    assert.equal((await cake.balanceOf(user1)).toString(), ether("100").toString());
    assert.equal((await cake.balanceOf(user2)).toString(), ether("100").toString());
    assert.equal((await cake.balanceOf(user3)).toString(), ether("100").toString());
  });

  it("Should deposit funds, withdraw funds and get shares with rewards", async () => {
    await zeroFeesSetup();

    assert.equal((await cake.balanceOf(user1)).toString(), ether("100").toString());
    assert.equal((await cake.balanceOf(user2)).toString(), ether("100").toString());
    assert.equal((await cake.balanceOf(user3)).toString(), ether("100").toString());

    // Time travel to start of rewards
    await time.advanceBlockTo(rewardsStartBlock);

    // Rewards started, so rewards are earned
    // 1 share should be > 1 cake, pricePerFullShare should equal be > 1
    let tx = await vault.deposit(ether("10"), { from: user1 }); // Vault receives 0 cake pending reward
    user1Shares = (await getUserInfo(user1)).shares;
    pricePerFullShare = await vault.getPricePerFullShare();
    assert.equal(pricePerFullShare.toString(), ether("1").toString()); // Expect == 1
    assert.equal(user1Shares.toString(), ether("10").toString()); // Expect == 10
    assert.equal(user1Shares.mul(pricePerFullShare).div(ether("1")).toString(), ether("10").toString()); // Expect == 10, Convert 1e18 to 1
    assert.equal((await vault.available()).toString(), 0);
    assert.equal((await vault.balanceOf()).toString(), ether("10").toString());
    assert.equal((await vault.totalShares()).toString(), ether("10").toString());
    expectEvent(tx, "Deposit", {
      sender: user1,
      amount: new BN(ether("10").toString()),
      shares: user1Shares,
      lastDepositedTime: await time.latest(),
    });
    let balance = await vault.balanceOf();
    let totalShares = await vault.totalShares();

    tx = await vault.deposit(ether("20"), { from: user2 }); // Vault receives 1 cake pending reward
    user2Shares = (await getUserInfo(user2)).shares;
    pricePerFullShare = await vault.getPricePerFullShare();
    let currentShares = ether("20").mul(totalShares).div(balance);
    assert.equal(pricePerFullShare.toString(), ether("1.033333333333333333").toString()); // Expect > prev > 1
    assert.equal(user2Shares.toString(), ether("20").toString()); // Expect == 100
    assert.equal(
      user2Shares.mul(pricePerFullShare).div(ether("1")).toString(),
      ether("20.666666666666666660").toString()
    ); // Expect > 20, Convert 1e18 to 1
    assert.equal((await vault.available()).toString(), ether("1").toString());
    assert.equal(
      (await vault.balanceOf()).toString(),
      balance
        .add(ether("20"))
        .add(await vault.available())
        .toString()
    ); // 30 + reward
    assert.equal((await vault.totalShares()).toString(), totalShares.add(currentShares).toString());
    expectEvent(tx, "Deposit", {
      sender: user2,
      amount: new BN(ether("20").toString()),
      shares: user2Shares,
      lastDepositedTime: await time.latest(),
    });
    balance = await vault.balanceOf();
    totalShares = await vault.totalShares();

    tx = await vault.deposit(await cake.balanceOf(user3), { from: user3 }); // Deposits 100 + 1 available, Vault receives 0.99999999999 cake pending reward
    user3Shares = (await getUserInfo(user3)).shares;
    pricePerFullShare = await vault.getPricePerFullShare();
    currentShares = ether("100").mul(totalShares).div(balance);
    assert.equal(pricePerFullShare.toString(), ether("1.041221374045722646").toString()); // Expect > prev > 1
    assert.equal(user3Shares.toString(), ether("96.774193548387096774").toString()); // Expect < 100
    assert.equal(
      user3Shares.mul(pricePerFullShare).div(ether("1")).toString(),
      ether("100.763358778618320580").toString()
    ); // Expect > 100, Convert 1e18 to 1
    assert.equal((await vault.available()).toString(), ether("0.99999999999").toString());
    assert.equal(
      (await vault.balanceOf()).toString(),
      balance
        .add(ether("100"))
        .add(await vault.available())
        .toString()
    ); // 130 + reward
    assert.equal((await vault.totalShares()).toString(), totalShares.add(currentShares).toString());
    expectEvent(tx, "Deposit", {
      sender: user3,
      amount: new BN(ether("100").toString()),
      shares: user3Shares,
      lastDepositedTime: await time.latest(),
    });
    balance = await vault.balanceOf();
    totalShares = await vault.totalShares();

    // Repeated deposit
    tx = await vault.deposit(ether("10"), { from: user1 }); // Vault receives 0.999999999966 cake pending reward
    user1Shares = (await getUserInfo(user1)).shares;
    pricePerFullShare = await vault.getPricePerFullShare();
    currentShares = ether("10").mul(totalShares).div(balance);
    assert.equal(pricePerFullShare.toString(), ether("1.048553918933119790").toString()); // Expect > prev > 1
    assert.equal(user1Shares.toString(), ether("19.604105571848234915").toString()); // Expect < 20
    assert.equal(
      user1Shares.mul(pricePerFullShare).div(ether("1")).toString(),
      ether("20.555961724540076095").toString()
    ); // Expect > 20, Convert 1e18 to 1
    assert.equal((await vault.available()).toString(), ether("0.999999999966").toString());
    assert.equal(
      (await vault.balanceOf()).toString(),
      balance
        .add(ether("10"))
        .add(await vault.available())
        .toString()
    );
    assert.equal((await vault.totalShares()).toString(), totalShares.add(currentShares).toString());
    expectEvent(tx, "Deposit", {
      sender: user1,
      amount: new BN(ether("10").toString()),
      shares: currentShares,
      lastDepositedTime: await time.latest(),
    });
    balance = await vault.balanceOf();
    totalShares = await vault.totalShares();

    tx = await vault.deposit(ether("20"), { from: user2 }); // Vault receives 0.999999999981929578 cake pending reward
    user2Shares = (await getUserInfo(user2)).shares;
    pricePerFullShare = await vault.getPricePerFullShare();
    currentShares = ether("20").mul(totalShares).div(balance);
    assert.equal(pricePerFullShare.toString(), ether("1.054986765061429330").toString()); // Expect > prev > 1
    assert.equal(user2Shares.toString(), ether("39.073887988849971222").toString()); // Expect < 40
    assert.equal(
      user2Shares.mul(pricePerFullShare).div(ether("1")).toString(),
      ether("41.222434687729469969").toString()
    ); // Expect > 40, Convert 1e18 to 1
    assert.equal((await vault.available()).toString(), ether("0.999999999981929578").toString());
    assert.equal(
      (await vault.balanceOf()).toString(),
      balance
        .add(ether("20"))
        .add(await vault.available())
        .toString()
    );
    assert.equal((await vault.totalShares()).toString(), totalShares.add(currentShares).toString());
    expectEvent(tx, "Deposit", {
      sender: user2,
      amount: new BN(ether("20").toString()),
      shares: currentShares,
      lastDepositedTime: await time.latest(),
    });
    balance = await vault.balanceOf();
    totalShares = await vault.totalShares();

    // Partial withdraw
    tx = await vault.withdraw(ether("10"), { from: user1 });
    pricePerFullShare = await vault.getPricePerFullShare();
    let currentAmount = balance.mul(ether("10")).div(totalShares);
    assert.equal(pricePerFullShare.toString(), ether("1.061861876531735077").toString()); // Expect > prev > 1
    assert.equal((await getUserInfo(user1)).shares.toString(), user1Shares.sub(ether("10")).toString()); // Expect > 10
    assert.equal(
      (await getUserInfo(user1)).shares.mul(pricePerFullShare).div(ether("1")).toString(),
      ether("10.198233564931659329").toString()
    ); // Expect > 10, Convert 1e18 to 1
    assert.equal((await vault.available()).toString(), ether("0.999999999974730061").toString());
    assert.equal(
      (await vault.balanceOf()).toString(),
      balance
        .sub(currentAmount)
        .add(await vault.available())
        .toString()
    );
    assert.equal((await vault.totalShares()).toString(), totalShares.sub(ether("10")).toString());
    expectEvent(tx, "Withdraw", {
      sender: user1,
      amount: currentAmount,
      shares: new BN(ether("10")),
    });
    balance = await vault.balanceOf();
    totalShares = await vault.totalShares();
    user1Shares = (await getUserInfo(user1)).shares;

    tx = await vault.withdraw(ether("20"), { from: user2 });
    pricePerFullShare = await vault.getPricePerFullShare();
    currentAmount = balance.mul(ether("20")).div(totalShares);
    assert.equal(pricePerFullShare.toString(), ether("1.069833040868856505").toString()); // Expect > prev > 1
    assert.equal((await getUserInfo(user2)).shares.toString(), user2Shares.sub(ether("20")).toString()); // Expect > 10
    assert.equal(
      (await getUserInfo(user2)).shares.mul(pricePerFullShare).div(ether("1")).toString(),
      ether("20.405875588303322471").toString()
    ); // Expect > 20, Convert 1e18 to 1
    assert.equal((await vault.available()).toString(), ether("0.999999999897825319").toString());
    assert.equal(
      (await vault.balanceOf()).toString(),
      balance
        .sub(currentAmount)
        .add(await vault.available())
        .toString()
    );
    assert.equal((await vault.totalShares()).toString(), totalShares.sub(ether("20")).toString());
    expectEvent(tx, "Withdraw", {
      sender: user2,
      amount: currentAmount,
      shares: new BN(ether("20")),
    });
    balance = await vault.balanceOf();
    totalShares = await vault.totalShares();
    user2Shares = (await getUserInfo(user2)).shares;

    // Full withdraw
    await vault.withdrawAll({ from: user1 });
    await vault.withdrawAll({ from: user2 });
    await vault.withdrawAll({ from: user3 });

    pricePerFullShare = await vault.getPricePerFullShare();
    assert.equal(pricePerFullShare.toString(), ether("1").toString());
    assert.equal((await getUserInfo(user1)).shares, 0);
    assert.equal((await getUserInfo(user2)).shares, 0);
    assert.equal((await getUserInfo(user3)).shares, 0);
    assert.equal((await vault.available()).toString(), ether("0.999999999937395716").toString()); // Leftovers
    assert.equal((await vault.balanceOf()).toString(), ether("0.999999999937395716").toString()); // Leftovers
    assert.equal(await vault.totalShares(), 0);
    assert.equal((await cake.balanceOf(user1)).toString(), ether("100.824657119370218484").toString()); // Expect > 100
    assert.equal((await cake.balanceOf(user2)).toString(), ether("101.807758814702448003").toString()); // Expect > user1Shares
    assert.equal((await cake.balanceOf(user3)).toString(), ether("105.367584065575769956").toString()); // Expect > user2Shares
  });

  it("Should not deposit funds when not enough funds", async () => {
    assert.equal((await cake.balanceOf(user1)).toString(), ether("100").toString());
    await expectRevert(vault.deposit(ether("999"), { from: user1 }), "ERC20: transfer amount exceeds balance");
  });

  it("Cannot deposit if amount is 0", async () => {
    await expectRevert(vault.deposit(ether("0"), { from: user1 }), "Nothing to deposit");
  });

  it("Should not withdraw funds when not enough shares", async () => {
    assert.equal((await getUserInfo(user1)).shares, 0);

    await expectRevert(vault.withdraw(ether("0"), { from: user1 }), "Nothing to withdraw");
    await expectRevert(vault.withdraw(ether("999"), { from: user1 }), "Withdraw amount exceeds balance");

    // Get some shares
    await vault.deposit(ether("10"), { from: user1 });

    assert.equal((await getUserInfo(user1)).shares.toString(), ether("10").toString());
    await expectRevert(vault.withdraw(ether("0"), { from: user1 }), "Nothing to withdraw");
    await expectRevert(vault.withdraw(ether("999"), { from: user1 }), "Withdraw amount exceeds balance");
  });

  it("Should withdraw with withdraw fee", async () => {
    // // Set withdraw fee period to
    // await vault.setWithdrawFeePeriod(time.duration.hours(9), { from: admin });
    // Withdraw fee: 0.1%
    assert.equal(await cake.balanceOf(user1), ether("100").toString());
    assert.equal(await cake.balanceOf(treasury), 0);

    // Time travel to start of rewards
    await time.advanceBlockTo(rewardsStartBlock);

    await vault.deposit(ether("10"), { from: user1 }); // lastDepositedAt starts
    assert.equal(await cake.balanceOf(user1), ether("90").toString());
    assert.equal((await vault.available()).toString(), ether("0").toString());
    assert.equal((await vault.balanceOf()).toString(), ether("10").toString());
    let balance = await cake.balanceOf(user1);

    // Withdraw before withdraw fee period
    let amount = ether("5");
    let amountForShares = (await vault.balanceOf()).mul(amount).div(await vault.totalShares());
    await vault.withdraw(amount, { from: user1 });

    let withdrawFee = amount.mul(new BN(10)).div(new BN(10000)); // 0.1%
    assert.equal((await cake.balanceOf(user1)).toString(), balance.add(amountForShares).sub(withdrawFee).toString());
    assert.equal((await cake.balanceOf(treasury)).toString(), withdrawFee.toString());
    balance = await cake.balanceOf(user1);

    // Time travel to after withdraw fee period
    await time.increase(time.duration.hours(72));

    amount = ether("5");
    amountForShares = (await vault.balanceOf()).mul(amount).div(await vault.totalShares());
    await vault.withdraw(amount, { from: user1 }); // No fees

    assert.equal((await cake.balanceOf(user1)).toString(), balance.add(amountForShares).toString());
    assert.equal((await cake.balanceOf(treasury)).toString(), withdrawFee.toString()); // No change
  });

  it("Should emergencyWithdraw all funds to vault", async () => {
    await zeroFeesSetup();

    assert.equal((await cake.balanceOf(user1)).toString(), ether("100").toString());
    assert.equal((await cake.balanceOf(user2)).toString(), ether("100").toString());
    assert.equal((await cake.balanceOf(user3)).toString(), ether("100").toString());

    await vault.deposit(ether("10"), { from: user1 });
    await vault.deposit(ether("20"), { from: user2 });
    await vault.deposit(ether("30"), { from: user3 });

    assert.equal((await vault.available()).toString(), 0);
    assert.equal((await vault.balanceOf()).toString(), ether("60").toString());

    // Withdraw all funds from masterchef to vault
    await vault.emergencyWithdraw({ from: admin });

    assert.equal((await vault.available()).toString(), ether("60").toString());
    assert.equal((await vault.balanceOf()).toString(), ether("60").toString());

    await vault.withdrawAll({ from: user1 });
    await vault.withdrawAll({ from: user2 });
    await vault.withdrawAll({ from: user3 });

    assert.equal(await vault.available(), 0);
    assert.equal(await vault.balanceOf(), 0);
    assert.equal((await cake.balanceOf(user1)).toString(), ether("100").toString());
    assert.equal((await cake.balanceOf(user2)).toString(), ether("100").toString());
    assert.equal((await cake.balanceOf(user3)).toString(), ether("100").toString());
  });

  it("Should harvest and reinvest funds", async () => {
    await zeroFeesSetup();

    // Time travel to start of rewards
    await time.advanceBlockTo(rewardsStartBlock);

    await vault.deposit(ether("10"), { from: user1 }); // Vault receives 0 cake pending reward
    await vault.deposit(ether("20"), { from: user2 }); // Vault receives 1 cake pending reward

    assert.equal((await vault.available()).toString(), ether("1").toString());
    assert.equal((await vault.balanceOf()).toString(), ether("31").toString());

    let pendingCake = ether("0.99999999999");
    await vault.harvest({ from: harvester }); // Receives 0.99999999999 pending cake reward

    assert.equal((await vault.available()).toString(), 0);
    assert.equal((await vault.balanceOf()).toString(), ether("31").add(pendingCake).toString());
    const balance = await vault.balanceOf();

    pendingCake = ether("0.9999999999996875");
    const tx = await vault.harvest({ from: harvester }); // Receives 0.9999999999996875 pending cake reward
    expectEvent(tx, "Harvest", {
      sender: harvester,
      performanceFee: new BN(0),
      callFee: new BN(0),
    }); // No fees

    assert.equal((await vault.available()).toString(), 0);
    assert.equal((await vault.balanceOf()).toString(), balance.add(pendingCake).toString());
  });

  it("Should harvest with performance and call fees", async () => {
    // Performance fee: 2%, Call fee: 0.25%
    assert.equal(await cake.balanceOf(treasury), 0);
    assert.equal(await cake.balanceOf(harvester), 0);

    // Time travel to start of rewards
    await time.advanceBlockTo(rewardsStartBlock);

    // Harvest
    await vault.deposit(ether("10"), { from: user1 }); // Vault receives 0 cake pending reward
    await vault.deposit(ether("20"), { from: user2 }); // Vault receives 1 cake pending reward
    assert.equal((await vault.available()).toString(), ether("1").toString());
    assert.equal((await vault.balanceOf()).toString(), ether("31").toString());

    let avail = ether("1");
    let pending = ether("0.99999999999");
    let tx = await vault.harvest({ from: harvester }); // Receives 0.99999999999 pending cake reward
    let treasuryFee = avail.add(pending).mul(new BN(2)).div(new BN(100)); // 2% * (1 + 0.99999999999), avail + pending
    let harvesterFee = avail.add(pending).mul(new BN(25)).div(new BN(10000)); // 0.25% * (1 + 0.99999999999), avail + pending
    expectEvent(tx, "Harvest", {
      sender: harvester,
      performanceFee: treasuryFee,
      callFee: harvesterFee,
    });

    assert.equal((await cake.balanceOf(treasury)).toString(), treasuryFee.toString());
    assert.equal((await cake.balanceOf(harvester)).toString(), harvesterFee.toString());
    assert.equal(await vault.available(), 0);
    assert.equal(
      (await vault.balanceOf()).toString(),
      ether("31").add(pending).sub(treasuryFee).sub(harvesterFee).toString()
    );
    let treasuryTotal = await cake.balanceOf(treasury);
    let harvesterTotal = await cake.balanceOf(harvester);

    // Harvest
    await vault.deposit(ether("10"), { from: user1 });
    await vault.deposit(ether("20"), { from: user2 });
    assert.equal((await vault.available()).toString(), ether("0.999999999987892013").toString());
    assert.equal((await vault.balanceOf()).toString(), ether("63.954999999957946114").toString());

    avail = ether("0.999999999987892013");
    pending = ether("0.999999999951499329");
    tx = await vault.harvest({ from: harvester }); // Receives 0.99999999999 pending cake reward
    treasuryFee = avail.add(pending).mul(new BN(2)).div(new BN(100)); // 2% * (1 + 0.99999999999), avail + pending
    harvesterFee = avail.add(pending).mul(new BN(25)).div(new BN(10000)); // 0.25% * (1 + 0.99999999999), avail + pending
    expectEvent(tx, "Harvest", {
      sender: harvester,
      performanceFee: treasuryFee,
      callFee: harvesterFee,
    });

    assert.equal((await cake.balanceOf(treasury)).toString(), treasuryTotal.add(treasuryFee).toString());
    assert.equal((await cake.balanceOf(harvester)).toString(), harvesterTotal.add(harvesterFee).toString());
    assert.equal(await vault.available(), 0);
    assert.equal(
      (await vault.balanceOf()).toString(),
      ether("63.954999999957946114").add(pending).sub(treasuryFee).sub(harvesterFee).toString()
    );
  });

  it("Should update lastHarvestedTime on each harvest", async () => {
    assert.equal(await vault.lastHarvestedTime(), 0);

    let currentTime = await time.latest();
    await vault.harvest();

    assert.notEqual((await vault.lastHarvestedTime()).toNumber(), 0);
    assert.isAtLeast((await vault.lastHarvestedTime()).toNumber(), currentTime.toNumber());

    currentTime = await time.latest();
    await vault.harvest();

    assert.isAtLeast((await vault.lastHarvestedTime()).toNumber(), currentTime.toNumber());
  });

  it("Should update lastDepositedTime on each deposit", async () => {
    assert.equal((await getUserInfo(user1)).lastDepositedTime, 0);
    assert.equal((await getUserInfo(user2)).lastDepositedTime, 0);
    assert.equal((await getUserInfo(user3)).lastDepositedTime, 0);

    let currentTime = await time.latest();
    await vault.deposit(ether("10"), { from: user1 });
    await vault.deposit(ether("20"), { from: user2 });
    await vault.deposit(ether("30"), { from: user3 });

    let user1LastDepositedTime = (await getUserInfo(user1)).lastDepositedTime;
    let user2LastDepositedTime = (await getUserInfo(user2)).lastDepositedTime;
    let user3LastDepositedTime = (await getUserInfo(user3)).lastDepositedTime;

    assert.equal(user1LastDepositedTime.toNumber(), currentTime.toNumber() + 1);
    assert.equal(user2LastDepositedTime.toNumber(), currentTime.toNumber() + 2);
    assert.equal(user3LastDepositedTime.toNumber(), currentTime.toNumber() + 3);

    currentTime = await time.latest();
    await vault.deposit(ether("10"), { from: user1 });
    await vault.deposit(ether("20"), { from: user2 });
    await vault.deposit(await cake.balanceOf(user3), { from: user3 });

    user1LastDepositedTime = (await getUserInfo(user1)).lastDepositedTime;
    user2LastDepositedTime = (await getUserInfo(user2)).lastDepositedTime;
    user3LastDepositedTime = (await getUserInfo(user3)).lastDepositedTime;

    assert.equal(user1LastDepositedTime.toNumber(), currentTime.toNumber() + 1);
    assert.equal(user2LastDepositedTime.toNumber(), currentTime.toNumber() + 2);
    assert.equal(user3LastDepositedTime.toNumber(), currentTime.toNumber() + 3);
  });

  it("Should emergencyWithdraw funds to vault", async () => {
    await zeroFeesSetup();

    await vault.deposit(ether("10"), { from: user1 });
    assert.equal((await vault.available()).toString(), 0);
    assert.equal((await vault.balanceOf()).toString(), ether("10"));

    await vault.emergencyWithdraw({ from: admin });
    assert.equal((await vault.available()).toString(), ether("10"));
    assert.equal((await vault.balanceOf()).toString(), ether("10"));

    await expectRevert(vault.emergencyWithdraw(), "admin: wut?");
  });

  it("Should withdraw non-cake and non-syrup tokens inCaseTokensGetStuck", async () => {
    await vault.deposit(ether("10"), { from: user1 });

    await expectRevert(vault.inCaseTokensGetStuck(cake.address), "admin: wut?");
    await expectRevert(vault.inCaseTokensGetStuck(syrup.address), "admin: wut?");
    await expectRevert(
      vault.inCaseTokensGetStuck(cake.address, { from: admin }),
      "Token cannot be same as deposit token"
    );
    await expectRevert(
      vault.inCaseTokensGetStuck(syrup.address, { from: admin }),
      "Token cannot be same as receipt token"
    );

    // Send non-cake/non-syrup tokens to vault (supposedly by mistake)
    const mockCake = await CakeToken.new({ from: owner });
    await mockCake.mint(user1, ether("100"), { from: owner });
    await mockCake.transfer(vault.address, ether("99"), { from: user1 });
    assert.equal((await mockCake.balanceOf(vault.address)).toString(), ether("99").toString()); // Vault has 99 mockCake

    await vault.inCaseTokensGetStuck(mockCake.address, { from: admin });
    assert.equal((await mockCake.balanceOf(vault.address)).toString(), ether("0").toString()); // Vault has 0 mockCake
    assert.equal((await mockCake.balanceOf(admin)).toString(), ether("99").toString()); // Admin now has 99 mockCake
  });

  it("Should pause and unpause", async () => {
    assert.equal(await vault.paused(), false);

    await expectRevert(vault.pause(), "admin: wut?");
    await expectRevert(vault.unpause(), "admin: wut?");

    let tx = await vault.pause({ from: admin });
    expectEvent(tx, "Pause");
    assert.equal(await vault.paused(), true);

    tx = await vault.unpause({ from: admin });
    expectEvent(tx, "Unpause");
    assert.equal(await vault.paused(), false);
  });

  it("Should disallow deposits and harvest when paused", async () => {
    await vault.pause({ from: admin });

    await expectRevert(vault.deposit(ether("10"), { from: user1 }), "Pausable: paused");
    await expectRevert(vault.harvest(), "Pausable: paused");

    await vault.unpause({ from: admin });

    await vault.deposit(ether("10"), { from: user1 });
    await vault.deposit(await cake.balanceOf(user1), { from: user1 });
    await vault.harvest();
  });

  it("VaultOwner contract works as expected", async () => {
    // Deploy VaultOwner and transfer ownership
    const vaultOwner = await VaultOwner.new(vault.address, { from: owner });
    await vault.transferOwnership(vaultOwner.address, { from: owner });
    assert.equal(await vault.admin(), admin);

    // Set vaultOwner as admin
    await vaultOwner.setAdmin({ from: owner });
    assert.equal(await vault.admin(), vaultOwner.address);

    // Set treasury (same as before)
    await vaultOwner.setTreasury(treasury, { from: owner });
    await vaultOwner.setPerformanceFee("0", { from: owner });
    assert.equal(String(await vault.performanceFee()), "0");

    // Set call fee
    await vaultOwner.setCallFee("0", { from: owner });
    assert.equal(String(await vault.callFee()), "0");

    // Set withdraw fee
    await vaultOwner.setWithdrawFee("12", { from: owner });
    assert.equal(String(await vault.withdrawFee()), "12");

    // Set withdraw fee period
    await vaultOwner.setWithdrawFeePeriod("72", { from: owner });
    assert.equal(String(await vault.withdrawFeePeriod()), "72");

    // Recover tokens sent by accident
    const randomToken = await MockERC20.new("Random Token", "RT", ether("100"), { from: owner });
    await randomToken.transfer(vault.address, ether("10"), { from: owner });

    assert.equal(String(await randomToken.balanceOf(owner)), ether("90").toString());
    assert.equal(String(await randomToken.balanceOf(vault.address)), ether("10").toString());

    await vaultOwner.inCaseTokensGetStuck(randomToken.address, { from: owner });
    assert.equal(String(await randomToken.balanceOf(vault.address)), ether("0").toString());
    assert.equal(String(await randomToken.balanceOf(owner)), ether("100").toString());

    // Pause/unpause
    await vaultOwner.pause({ from: owner });

    await expectRevert(vault.deposit(ether("10"), { from: user1 }), "Pausable: paused");
    await expectRevert(vault.harvest(), "Pausable: paused");

    await vaultOwner.unpause({ from: owner });

    // Testing Ownable function revertions
    await expectRevert(vaultOwner.setAdmin({ from: user1 }), "Ownable: caller is not the owner");
    await expectRevert(vaultOwner.setTreasury(treasury, { from: user1 }), "Ownable: caller is not the owner");
    await expectRevert(vaultOwner.setPerformanceFee("0", { from: user1 }), "Ownable: caller is not the owner");
    await expectRevert(vaultOwner.setCallFee("0", { from: user1 }), "Ownable: caller is not the owner");
    await expectRevert(vaultOwner.setWithdrawFee("12", { from: user1 }), "Ownable: caller is not the owner");
    await expectRevert(vaultOwner.setWithdrawFeePeriod("72", { from: user1 }), "Ownable: caller is not the owner");
    await expectRevert(
      vaultOwner.inCaseTokensGetStuck(randomToken.address, { from: user1 }),
      "Ownable: caller is not the owner"
    );
    await expectRevert(vaultOwner.pause({ from: user1 }), "Ownable: caller is not the owner");
    await expectRevert(vaultOwner.unpause({ from: user1 }), "Ownable: caller is not the owner");
  });
});
