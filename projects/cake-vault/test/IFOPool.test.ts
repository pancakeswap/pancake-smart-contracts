import { artifacts, contract, ethers, network } from "hardhat";
import { ether, time, constants, BN, expectRevert, expectEvent } from "@openzeppelin/test-helpers";
import { assert, expect } from "chai";

const CakeToken = artifacts.require("CakeToken");
const SyrupBar = artifacts.require("SyrupBar");
const MasterChef = artifacts.require("MasterChef");
const CakeVault = artifacts.require("IFOPool");
// const VaultOwner = artifacts.require("VaultOwner");
const MockERC20 = artifacts.require("MockERC20");
const snapshot = require("@openzeppelin/test-helpers/src/snapshot");

const REWARDS_START_BLOCK = 100;

contract("IFOPool", ([owner, admin, treasury, user1, user2, user3, harvester]) => {
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

  async function getUserCredit(user) {
    console.log(
      "block %s, credit %s",
      await time.latestBlock(),
      ethers.utils.formatEther((await vault.getUserCredit(user)).toString())
    );
    return parseFloat(ethers.utils.formatEther((await vault.getUserCredit(user)).toString()));
  }

  beforeEach(async () => {
    rewardsStartBlock = (await time.latestBlock()).toNumber() + REWARDS_START_BLOCK;

    // console.log(rewardsStartBlock);
    cake = await CakeToken.new({ from: owner });
    syrup = await SyrupBar.new(cake.address, { from: owner });
    masterchef = await MasterChef.new(cake.address, syrup.address, owner, ether("1"), rewardsStartBlock, {
      from: owner,
    }); // 1 cake per block, starts at +100 block of each test
    vault = await CakeVault.new(cake.address, syrup.address, masterchef.address, admin, treasury, 1001, 1020, {
      from: owner,
    });

    await cake.mint(user1, ether("1000"), { from: owner });
    await cake.mint(user2, ether("1000"), { from: owner });
    await cake.mint(user3, ether("1000"), { from: owner });
    await cake.approve(vault.address, ether("100000"), { from: user1 });
    await cake.approve(vault.address, ether("1000"), { from: user2 });
    await cake.approve(vault.address, ether("1000"), { from: user3 });
    await cake.transferOwnership(masterchef.address, { from: owner });
    await syrup.transferOwnership(masterchef.address, { from: owner });
  });

  it("Initialize", async () => {
    const snapshotA = await snapshot();

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

    await snapshotA.restore();
  });

  it("Should deposit 10,20,40 cakes at block 2 8 14 and final with credit around 34.73 as case 1", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(1001);
      await vault.deposit(ether("10"), { from: user1 });

      await time.advanceBlockTo(1007);
      await vault.deposit(ether("20"), { from: user1 });

      await time.advanceBlockTo(1013);
      await vault.deposit(ether("40"), { from: user1 });

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.be.within(34.73, 34.74);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should deposit 200 cakes at block 17 and final with credit around 31.57 as case 2", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(1016);
      await vault.deposit(ether("200"), { from: user1 });

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.be.within(31.57, 31.58);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should deposit 100 at block 3 and withdraw 100 at block 8 finally credit around 26.31 as case 3", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(1002);
      await vault.deposit(ether("100"), { from: user1 });

      await time.advanceBlockTo(1007);
      await vault.withdraw(ether("100"), { from: user1 });

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.be.within(26.31, 26.32);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should deposit 50 cake at block 2 and final with credit around 47.36 as case 4", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(1001);
      await vault.deposit(ether("50"), { from: user1 });

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.be.within(47.36, 47.37);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should deposit at block -1 and final with credit around 40 as case 5", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(999);
      await vault.deposit(ether("40"), { from: user1 });

      await time.advanceBlockTo(1019);
      await getUserCredit(user1);

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.equal(40.0);

      await time.advanceBlockTo(1021);
      await getUserCredit(user1);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should deposit at block 2 22 and block 20 with credit around 9.47 block 22 credit around 9.47 as case 6", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(1001);
      await vault.deposit(ether("10"), { from: user1 });

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.be.within(9.47, 9.48);

      await time.advanceBlockTo(1021);
      await vault.deposit(ether("10"), { from: user1 });
      expect(await getUserCredit(user1)).to.be.within(9.47, 9.48);

      await time.advanceBlockTo(1025);
      expect(await getUserCredit(user1)).to.be.within(9.47, 9.48);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should deposit at block 22 and final with credit around 0 as case 7", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.equal(parseFloat("0"));

      await time.advanceBlockTo(1021);
      await vault.deposit(ether("10"), { from: user1 });

      await time.advanceBlockTo(1025);
      expect(await getUserCredit(user1)).to.equal(parseFloat("0"));
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should deposit at block -1 8 and final with credit around 46.31 as case 8", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(999);
      await vault.deposit(ether("40"), { from: user1 });

      await time.advanceBlockTo(1007);
      await vault.deposit(ether("10"), { from: user1 });

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.be.within(46.31, 46.32);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should deposit at block -1 8 and withdraw at 22 finally credit around 46.31 as case 9", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(999);
      await vault.deposit(ether("40"), { from: user1 });

      await time.advanceBlockTo(1007);
      await vault.deposit(ether("10"), { from: user1 });

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.be.within(46.31, 46.32);

      await time.advanceBlockTo(1021);
      await vault.withdraw(ether("40"), { from: user1 });

      await time.advanceBlockTo(1025);
      expect(await getUserCredit(user1)).to.be.within(46.31, 46.32);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should deposit at block 2, 21 withdraw at 23 and finally with credit around 9.47 as case 10", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(1001);
      await vault.deposit(ether("10"), { from: user1 });

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.be.within(9.47, 9.48);

      await vault.deposit(ether("10"), { from: user1 });
      expect(await getUserCredit(user1)).to.be.within(9.47, 9.48);

      await time.advanceBlockTo(1022);
      await vault.withdraw(ether("15"), { from: user1 });
      expect(await getUserCredit(user1)).to.be.within(9.47, 9.48);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should user1 deposit at block 2, 3, 14 user2 deposit at 3 withdraw at 8 and final credit is user1 34.76 user2 26.31", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());
      assert.equal((await cake.balanceOf(user2)).toString(), ether("1000").toString());

      await time.advanceBlockTo(1001);
      await vault.deposit(ether("10"), { from: user1 });

      await time.advanceBlockTo(1007);
      await vault.deposit(ether("20"), { from: user1 });

      await time.advanceBlockTo(1013);
      await vault.deposit(ether("40"), { from: user1 });

      await time.advanceBlockTo(1016);
      await vault.deposit(ether("200"), { from: user2 });

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.be.within(34.73, 34.74);
      expect(await getUserCredit(user2)).to.be.within(31.57, 31.58);

      await vault.withdraw(ether("150"), { from: user2 });
      await vault.withdraw(ether("15"), { from: user1 });
      await vault.deposit(ether("18"), { from: user1 });
      await vault.deposit(ether("18"), { from: user2 });
      expect(await getUserCredit(user1)).to.be.within(34.73, 34.74);
      expect(await getUserCredit(user2)).to.be.within(31.57, 31.58);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should deposit 10,20,40 cakes at block 2 8 14 and final with credit around 34.73 as case 1 with updateEndBlock", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(1001);
      await vault.deposit(ether("10"), { from: user1 });
      await getUserCredit(user1);

      await vault.updateEndBlock(1005, { from: admin });

      await time.advanceBlockTo(1003);
      expect(await getUserCredit(user1)).to.be.within(5, 5.01);

      await time.advanceBlockTo(1004);
      expect(await getUserCredit(user1)).to.be.within(6.66, 6.67);

      await time.advanceBlockTo(1007);
      expect(await getUserCredit(user1)).to.be.within(7.5, 7.51);
      await vault.deposit(ether("20"), { from: user1 });

      await time.advanceBlockTo(1013);
      await vault.deposit(ether("40"), { from: user1 });

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.be.within(7.5, 7.51);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should 3 users deposit", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(990);
      await vault.deposit(ether("10"), { from: user1 });

      await time.advanceBlockTo(991);
      await vault.deposit(ether("10"), { from: user2 });

      await time.advanceBlockTo(992);
      await vault.deposit(ether("10"), { from: user3 });

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.be.within(10, 10.01);
      expect(await getUserCredit(user2)).to.be.within(10, 10.01);
      expect(await getUserCredit(user3)).to.be.within(10, 10.01);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should deposit a small num of cake and share not equal to 0", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(990);
      await vault.deposit(ether("100"), { from: user2 });

      await vault.deposit(ether("100"), { from: user2 });

      await vault.deposit(ether("100"), { from: user2 });

      await vault.deposit(ether("100"), { from: user2 });

      await vault.deposit(ether("100"), { from: user2 });

      await vault.deposit(ether("100"), { from: user3 });

      await vault.deposit(ether("100"), { from: user3 });

      await vault.deposit(ether("100"), { from: user3 });

      await vault.deposit(ether("100"), { from: user3 });

      await vault.withdraw(ether("100"), { from: user3 });

      await vault.withdraw(ether("100"), { from: user2 });

      await vault.deposit(ether("0.011"), { from: user1 });

      await time.advanceBlockTo(1020);

      console.log((await vault.userInfo(user1))["shares"].toString());
      expect(Number((await vault.userInfo(user1))["shares"])).to.be.above(0);
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should not deposit after emergencyWithdraw", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(990);
      await vault.deposit(ether("100"), { from: user2 });

      await vault.emergencyWithdraw({ from: admin });

      await expectRevert(vault.deposit(ether("100"), { from: user2 }), "Pausable: paused");

      await expectRevert(vault.pause({ from: admin }), "Pausable: paused");

      await vault.unpause({ from: admin });

      vault.deposit(ether("100"), { from: user2 });
    } finally {
      await snapshotA.restore();
    }
  });

  it("Should deposit 10,20,40 cakes at block 2 8 14 and final with credit around 34.73 as case 1 with multiple updateEndBlock", async () => {
    const snapshotA = await snapshot();
    try {
      await vault.setPerformanceFee(200, { from: admin });
      await vault.setCallFee(20, { from: admin });
      await vault.setWithdrawFee(80, { from: admin });

      assert.equal((await cake.balanceOf(user1)).toString(), ether("1000").toString());

      await time.advanceBlockTo(1001);
      await vault.deposit(ether("10"), { from: user1 });
      await getUserCredit(user1);

      await vault.updateEndBlock(1005, { from: admin });

      await time.advanceBlockTo(1003);
      await vault.updateEndBlock(1015, { from: admin });

      await time.advanceBlockTo(1007);
      await vault.deposit(ether("20"), { from: user1 });
      await vault.updateEndBlock(1025, { from: admin });

      await vault.updateStartAndEndBlocks(1025, 1030, { from: admin });

      console.log(ethers.utils.formatEther((await vault.userIFOInfo(user1))["lastActionBlock"].toString()));
      console.log(ethers.utils.formatEther((await vault.userIFOInfo(user1))["lastValidActionBlock"].toString()));
      console.log(ethers.utils.formatEther((await vault.userIFOInfo(user1))["lastActionBalance"].toString()));
      console.log(ethers.utils.formatEther((await vault.userIFOInfo(user1))["lastValidActionBalance"].toString()));
      console.log(ethers.utils.formatEther((await vault.userIFOInfo(user1))["lastAvgBalance"].toString()));

      await time.advanceBlockTo(1013);
      await vault.deposit(ether("40"), { from: user1 });
      await getUserCredit(user1);

      console.log(ethers.utils.formatEther((await vault.userIFOInfo(user1))["lastActionBlock"].toString()));
      console.log(ethers.utils.formatEther((await vault.userIFOInfo(user1))["lastValidActionBlock"].toString()));
      console.log(ethers.utils.formatEther((await vault.userIFOInfo(user1))["lastActionBalance"].toString()));
      console.log(ethers.utils.formatEther((await vault.userIFOInfo(user1))["lastValidActionBalance"].toString()));
      console.log(ethers.utils.formatEther((await vault.userIFOInfo(user1))["lastAvgBalance"].toString()));

      console.log(
        "cake of masterchef : %s ",
        ethers.utils.formatEther((await cake.balanceOf(masterchef.address)).toString())
      );
      await vault.deposit(ether("500"), { from: user1 });
      console.log(
        "cake of masterchef : %s ",
        ethers.utils.formatEther((await cake.balanceOf(masterchef.address)).toString())
      );
      console.log("cake of user1 : %s ", ethers.utils.formatEther((await cake.balanceOf(user1)).toString()));

      let user1Shares = ethers.utils.formatEther((await getUserInfo(user1)).shares.toString());
      console.log("shares : %s ", user1Shares);

      console.log(
        "cake of masterchef : %s ",
        ethers.utils.formatEther((await cake.balanceOf(masterchef.address)).toString())
      );
      await vault.harvest({ from: user1 });
      console.log(
        "cake of masterchef : %s ",
        ethers.utils.formatEther((await cake.balanceOf(masterchef.address)).toString())
      );

      user1Shares = ethers.utils.formatEther((await getUserInfo(user1)).shares.toString());
      console.log("shares : %s ", user1Shares);

      await vault.withdraw(ether("400.512195121951219509"), { from: user1 });
      console.log("cake of user1 : %s ", ethers.utils.formatEther((await cake.balanceOf(user1)).toString()));

      await time.advanceBlockTo(1020);
      expect(await getUserCredit(user1)).to.be.within(0, 0.01);
    } finally {
      await snapshotA.restore();
    }
  });
});
