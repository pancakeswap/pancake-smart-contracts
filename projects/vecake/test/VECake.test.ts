import { artifacts, contract, ethers, network } from "hardhat";
import { time, BN, expectEvent, expectRevert } from "@openzeppelin/test-helpers";
import { parseEther, formatEther } from "ethers/lib/utils";
import { expect } from "chai";
import { beforeEach } from "mocha";
import { BigNumber } from "ethers";

import ERC20MockArtifact from "./artifactsFile/ERC20Mock.json";
import CakeTokenArtifact from "./artifactsFile/CakeToken.json";
import SyrupBarArtifact from "./artifactsFile/SyrupBar.json";
import MasterChefArtifact from "./artifactsFile/MasterChef.json";
import MasterChefV2Artifact from "./artifactsFile/MasterChefV2.json";
import CakePoolArtifact from "./artifactsFile/CakePool.json";
import VECakeArtifact from "./artifactsFile/VECakeTest.json";
import ProxyForCakePoolArtifact from "./artifactsFile/ProxyForCakePool.json";
import ProxyForCakePoolFactoryArtifact from "./artifactsFile/ProxyForCakePoolFactory.json";
import DelegatorArtifact from "./artifactsFile/Delegator.json";

const ZERO = BigNumber.from(0);
const DAY = BigNumber.from(86400);
const WEEK = DAY.mul(7);
const YEAR = DAY.mul(365);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("VCake", () => {
  let ProxyForCakePoolFactorySC, masterChefV2, CakePoolSC, VECakeSC, CakeTokenSC;
  let admin;
  let user1;
  let user2;
  let user3;
  let user4;
  let treasury;
  let redistributor;
  before(async function () {
    [admin, user1, user2, user3, user4, treasury, redistributor] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const ERC20Mock = await ethers.getContractFactoryFromArtifact(ERC20MockArtifact);

    // deploy cake token
    const CakeToken = await ethers.getContractFactoryFromArtifact(CakeTokenArtifact);
    CakeTokenSC = await CakeToken.deploy();
    // mint cake for users
    await CakeTokenSC["mint(address,uint256)"](admin.address, ethers.utils.parseUnits("100000000000000"));
    await CakeTokenSC["mint(address,uint256)"](user1.address, ethers.utils.parseUnits("100000000"));
    await CakeTokenSC["mint(address,uint256)"](user2.address, ethers.utils.parseUnits("100000000"));
    await CakeTokenSC["mint(address,uint256)"](user3.address, ethers.utils.parseUnits("100000000"));
    await CakeTokenSC["mint(address,uint256)"](user4.address, ethers.utils.parseUnits("100000000"));

    // deploy SyrupBar
    const SyrupBar = await ethers.getContractFactoryFromArtifact(SyrupBarArtifact);
    const syrupBar = await SyrupBar.deploy(CakeTokenSC.address);

    // deploy MasterChef
    const MasterChef = await ethers.getContractFactoryFromArtifact(MasterChefArtifact);
    const masterChef = await MasterChef.deploy(
      CakeTokenSC.address,
      syrupBar.address,
      admin.address,
      ethers.utils.parseUnits("40"),
      ethers.constants.Zero
    );

    // transfer ownership to MasterChef
    await CakeTokenSC.transferOwnership(masterChef.address);
    await syrupBar.transferOwnership(masterChef.address);

    const lpTokenV1 = await ERC20Mock.deploy("LP Token V1", "LPV1");
    const dummyTokenV2 = await ERC20Mock.deploy("Dummy Token V2", "DTV2");

    // add pools in MasterChef
    await masterChef.add(0, lpTokenV1.address, true); // farm with pid 1 and 0 allocPoint
    await masterChef.add(1, dummyTokenV2.address, true); // farm with pid 2 and 1 allocPoint

    // deploy MasterChefV2
    const MasterChefV2 = await ethers.getContractFactoryFromArtifact(MasterChefV2Artifact);
    masterChefV2 = await MasterChefV2.deploy(masterChef.address, CakeTokenSC.address, 2, admin.address);

    await dummyTokenV2.mint(admin.address, ethers.utils.parseUnits("1000"));
    await dummyTokenV2.approve(masterChefV2.address, ethers.constants.MaxUint256);
    await masterChefV2.init(dummyTokenV2.address);

    const lpTokenV2 = await ERC20Mock.deploy("LP Token V2", "LPV2");
    const dummyTokenV3 = await ERC20Mock.deploy("Dummy Token V3", "DTV3");
    const dummyTokenForCakePool = await ERC20Mock.deploy("Dummy Token Cake Pool", "DTCP");
    const dummyTokenForSpecialPool2 = await ERC20Mock.deploy("Dummy Token Special pool 2", "DT");

    await masterChefV2.add(0, lpTokenV2.address, true, true); // regular farm with pid 0 and 1 allocPoint
    await masterChefV2.add(1, dummyTokenV3.address, true, true); // regular farm with pid 1 and 1 allocPoint
    await masterChefV2.add(1, dummyTokenForCakePool.address, false, true); // special farm with pid 2 and 1 allocPoint
    await masterChefV2.add(0, dummyTokenForSpecialPool2.address, false, true); // special farm with pid 3 and 0 allocPoint

    // deploy cake pool
    const CakePool = await ethers.getContractFactoryFromArtifact(CakePoolArtifact);
    CakePoolSC = await CakePool.deploy(
      CakeTokenSC.address,
      masterChefV2.address,
      admin.address,
      admin.address,
      admin.address,
      2
    );
    await masterChefV2.updateWhiteList(CakePoolSC.address, true);
    await dummyTokenForCakePool.mint(admin.address, ethers.utils.parseUnits("1000"));
    await dummyTokenForCakePool.approve(CakePoolSC.address, ethers.constants.MaxUint256);
    await CakePoolSC.init(dummyTokenForCakePool.address);

    //  approve cake for CakePoolSC
    await CakeTokenSC.connect(admin).approve(CakePoolSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user1).approve(CakePoolSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user2).approve(CakePoolSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user3).approve(CakePoolSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user4).approve(CakePoolSC.address, ethers.constants.MaxUint256);

    // deploy ProxyForCakePoolFactory
    const ProxyForCakePoolFactory = await ethers.getContractFactoryFromArtifact(ProxyForCakePoolFactoryArtifact);
    ProxyForCakePoolFactorySC = await ProxyForCakePoolFactory.deploy();

    // deploy VECake
    const VECake = await ethers.getContractFactoryFromArtifact(VECakeArtifact);
    VECakeSC = await VECake.deploy(CakePoolSC.address, CakeTokenSC.address, ProxyForCakePoolFactorySC.address);

    await CakeTokenSC.connect(admin).approve(VECakeSC.address, ethers.constants.MaxUint256);

    await ProxyForCakePoolFactorySC.initialize(VECakeSC.address);

    await CakePoolSC.setVCakeContract(VECakeSC.address);

    await VECakeSC.initializeCakePoolMigration();

    // lock cake in cake pool
    await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("1000"), 3600 * 24 * 365);
    await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("1000"), 3600 * 24 * 365);
    await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("1000"), 3600 * 24 * 365);
  });

  afterEach(async () => {
    await network.provider.send("hardhat_reset");
  });

  describe("users migrate from cake pool", () => {
    beforeEach(async function () {
      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("1"), 0);
    });

    it("Migrated successfully", async function () {
      let userInfoOfUser2InCakePool = await CakePoolSC.userInfo(user2.address);

      let totalShares = await CakePoolSC.totalShares();
      let balanceOf = await CakePoolSC.balanceOf();
      // uint256 currentAmount = (balanceOf() * (user.shares)) / totalShares - user.userBoostedShare;
      let currentLockedBalanceOfUser2 = userInfoOfUser2InCakePool.shares
        .mul(balanceOf)
        .div(totalShares)
        .sub(userInfoOfUser2InCakePool.userBoostedShare)
        .sub(1);

      // migrate from cake pool
      await VECakeSC.connect(user2).migrateFromCakePool();

      let userInfoOfUser2InVECake = await VECakeSC.getUserInfo(user2.address);

      let ProxyForCakePool = await ethers.getContractFactoryFromArtifact(ProxyForCakePoolArtifact);
      let ProxyForCakePoolSC = await ProxyForCakePool.attach(userInfoOfUser2InVECake.cakePoolProxy);

      let cakePoolUser = await ProxyForCakePoolSC.cakePoolUser();

      expect(cakePoolUser).to.deep.eq(user2.address);
      expect(userInfoOfUser2InVECake.amount).to.deep.eq(ZERO);
      expect(userInfoOfUser2InVECake.end).to.deep.eq(ZERO);
      expect(userInfoOfUser2InVECake.cakePoolType).to.deep.eq(1);
      expect(userInfoOfUser2InVECake.withdrawFlag).to.deep.eq(0);
      expect(userInfoOfUser2InCakePool.lockEndTime.toString()).to.deep.eq(
        userInfoOfUser2InVECake.lockEndTime.toString()
      );
      expect(currentLockedBalanceOfUser2).to.deep.eq(userInfoOfUser2InVECake.cakeAmount);

      let proxyLockedBalanceOfUser2 = await VECakeSC.locks(userInfoOfUser2InVECake.cakePoolProxy);

      expect(proxyLockedBalanceOfUser2.amount).to.deep.eq(userInfoOfUser2InVECake.cakeAmount);
      expect(proxyLockedBalanceOfUser2.end).to.deep.eq(
        BigNumber.from(userInfoOfUser2InVECake.lockEndTime).div(WEEK).mul(WEEK)
      );

      // can not deposit again in cake pool

      //   await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("10"),0);

      await expectRevert.unspecified(CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("10"), 0));

      await time.increaseTo(userInfoOfUser2InCakePool.lockEndTime.add(1).toNumber());

      await CakePoolSC.connect(user2).withdraw(userInfoOfUser2InCakePool.shares);

      userInfoOfUser2InCakePool = await CakePoolSC.userInfo(user2.address);
      // console.log(userInfoOfUser2InCakePool);

      let allUserInfo = await VECakeSC.getUserInfo(user2.address);
      // console.log(allUserInfo);
    });

    it("Can not deposit in cake pool after Migrated", async function () {
      // migrate from cake pool
      await VECakeSC.connect(user2).migrateFromCakePool();

      // can not deposit again in cake pool
      await expectRevert.unspecified(CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("10"), 0));
    });

    it("Can withdraw in cake pool after Migration lock expired", async function () {
      // migrate from cake pool
      await VECakeSC.connect(user2).migrateFromCakePool();

      let userInfoOfUser2InCakePool = await CakePoolSC.userInfo(user2.address);

      await time.increaseTo(userInfoOfUser2InCakePool.lockEndTime.add(1).toNumber());

      await CakePoolSC.connect(user2).withdraw(userInfoOfUser2InCakePool.shares);

      let userInfoOfUser2InVECake = await VECakeSC.getUserInfo(user2.address);
      expect(userInfoOfUser2InVECake.withdrawFlag).to.deep.eq(1);

      let proxyLockedBalanceOfUser2 = await VECakeSC.locks(userInfoOfUser2InVECake.cakePoolProxy);

      expect(proxyLockedBalanceOfUser2.amount).to.deep.eq(ZERO);
      expect(proxyLockedBalanceOfUser2.end).to.deep.eq(ZERO);
    });

    it("Check whether the cake amount is calculated correctly", async function () {
      // migrate from cake pool
      await VECakeSC.connect(user2).migrateFromCakePool();

      let userInfoOfUser2InCakePool = await CakePoolSC.userInfo(user2.address);

      await time.increaseTo(userInfoOfUser2InCakePool.lockEndTime.add(1).toNumber());

      let cakeBalanceBeforeOfUser2 = await CakeTokenSC.balanceOf(user2.address);

      await CakePoolSC.connect(user2).withdraw(userInfoOfUser2InCakePool.shares);

      let cakeBalanceAfterOfUser2 = await CakeTokenSC.balanceOf(user2.address);

      let userInfoOfUser2InVECake = await VECakeSC.getUserInfo(user2.address);

      expect(userInfoOfUser2InVECake.withdrawFlag).to.deep.eq(1);

      let proxyLockedBalanceOfUser2 = await VECakeSC.locks(userInfoOfUser2InVECake.cakePoolProxy);

      expect(proxyLockedBalanceOfUser2.amount).to.deep.eq(ZERO);
      expect(proxyLockedBalanceOfUser2.end).to.deep.eq(ZERO);
      expect(cakeBalanceAfterOfUser2.sub(cakeBalanceBeforeOfUser2)).to.deep.eq(userInfoOfUser2InVECake.cakeAmount);
    });
  });

  describe("users delegate from cake pool", () => {
    let delegatorSC;

    beforeEach(async function () {
      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("1"), 0);

      // deploy mock delegator smart contract
      const Delegator = await ethers.getContractFactoryFromArtifact(DelegatorArtifact);
      delegatorSC = await Delegator.deploy(VECakeSC.address, CakeTokenSC.address);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      // add whitelist for delegator in VECakeSC
      await VECakeSC.setWhitelistedCallers([delegatorSC.address], true);
      // add delegator in VECakeSC
      await VECakeSC.updateDelegator(delegatorSC.address, true, OneYear);

      // create lock for delegator
      await CakeTokenSC.approve(delegatorSC.address, ethers.utils.parseUnits("1"));
      await delegatorSC.createLock(ethers.utils.parseUnits("1"), OneYear);
    });

    it("Delegated successfully", async function () {
      let userInfoOfUser3InCakePool = await CakePoolSC.userInfo(user3.address);

      let totalShares = await CakePoolSC.totalShares();
      let balanceOf = await CakePoolSC.balanceOf();
      // uint256 currentAmount = (balanceOf() * (user.shares)) / totalShares - user.userBoostedShare;
      let currentLockedBalanceOfUser3 = userInfoOfUser3InCakePool.shares
        .mul(balanceOf)
        .div(totalShares)
        .sub(userInfoOfUser3InCakePool.userBoostedShare)
        .sub(1);

      // delegate from cake pool
      await VECakeSC.connect(user3).delegateFromCakePool(delegatorSC.address);

      let delegatorTokenBalanceOfUser3 = await delegatorSC.balanceOf(user3.address);

      let userInfoOfUser3InVECake = await VECakeSC.userInfo(user3.address);
      let delegatorInfo = await VECakeSC.delegator(delegatorSC.address);

      expect(delegatorTokenBalanceOfUser3).to.deep.eq(userInfoOfUser3InVECake.cakeAmount);

      expect(userInfoOfUser3InVECake.cakePoolProxy).to.deep.eq(ZERO_ADDRESS);
      expect(userInfoOfUser3InVECake.cakeAmount).to.deep.eq(currentLockedBalanceOfUser3);
      expect(BigNumber.from(userInfoOfUser3InVECake.lockEndTime)).to.deep.eq(
        BigNumber.from(userInfoOfUser3InCakePool.lockEndTime)
      );
      expect(userInfoOfUser3InVECake.cakePoolType).to.deep.eq(2);

      expect(delegatorInfo.delegatedCakeAmount).to.deep.eq(currentLockedBalanceOfUser3);
      expect(delegatorInfo.delegatedCakeAmount).to.deep.eq(userInfoOfUser3InVECake.cakeAmount);
      expect(delegatorInfo.delegatedCakeAmount).to.deep.eq(delegatorInfo.notInjectedCakeAmount);
    });

    it("Can not deposit in cake pool after delegated", async function () {
      // delegate from cake pool
      await VECakeSC.connect(user3).delegateFromCakePool(delegatorSC.address);

      // can not deposit again in cake pool
      await expectRevert.unspecified(CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("10"), 0));
    });

    it("Can not withdraw in cake pool after delegation lock expired", async function () {
      // delegate from cake pool
      await VECakeSC.connect(user3).delegateFromCakePool(delegatorSC.address);

      // can not deposit again in cake pool
      await expectRevert.unspecified(CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("10"), 0));

      let userInfoOfUser3InCakePool = await CakePoolSC.userInfo(user3.address);

      await time.increaseTo(userInfoOfUser3InCakePool.lockEndTime.add(1).toNumber());

      await expectRevert.unspecified(CakePoolSC.connect(user3).withdraw(userInfoOfUser3InCakePool.shares));
    });

    it("Can inject cake for delegator", async function () {
      // delegate from cake pool
      await VECakeSC.connect(user3).delegateFromCakePool(delegatorSC.address);

      let delegatorInfo = await VECakeSC.delegator(delegatorSC.address);
      await VECakeSC.injectToDelegator(delegatorSC.address, delegatorInfo.notInjectedCakeAmount);

      delegatorInfo = await VECakeSC.delegator(delegatorSC.address);
      expect(delegatorInfo.notInjectedCakeAmount).to.deep.eq(ZERO);
    });
  });

  describe("Migration can be converted to delegation", () => {
    let delegatorSC;
    beforeEach(async function () {
      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("1"), 0);

      // deploy mock delegator smart contract
      const Delegator = await ethers.getContractFactoryFromArtifact(DelegatorArtifact);
      delegatorSC = await Delegator.deploy(VECakeSC.address, CakeTokenSC.address);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      // add whitelist for delegator in VECakeSC
      await VECakeSC.setWhitelistedCallers([delegatorSC.address], true);
      // add delegator in VECakeSC
      await VECakeSC.updateDelegator(delegatorSC.address, true, OneYear);

      // create lock for delegator
      await CakeTokenSC.approve(delegatorSC.address, ethers.utils.parseUnits("1"));
      await delegatorSC.createLock(ethers.utils.parseUnits("1"), OneYear);
    });

    it("Delegated from migration successfully", async function () {
      let userInfoOfUser2InCakePool = await CakePoolSC.userInfo(user2.address);

      let totalShares = await CakePoolSC.totalShares();
      let balanceOf = await CakePoolSC.balanceOf();
      // uint256 currentAmount = (balanceOf() * (user.shares)) / totalShares - user.userBoostedShare;
      let currentLockedBalanceOfUser2 = userInfoOfUser2InCakePool.shares
        .mul(balanceOf)
        .div(totalShares)
        .sub(userInfoOfUser2InCakePool.userBoostedShare)
        .sub(1);

      await VECakeSC.connect(user2).migrateFromCakePool();

      let userInfoOfUser2InVECake = await VECakeSC.userInfo(user2.address);

      // console.log(userInfoOfUser2InVECake);

      expect(userInfoOfUser2InCakePool.lockEndTime.toString()).to.deep.eq(
        userInfoOfUser2InVECake.lockEndTime.toString()
      );
      expect(currentLockedBalanceOfUser2).to.deep.eq(userInfoOfUser2InVECake.cakeAmount);

      await VECakeSC.connect(user2).migrationConvertToDelegation(delegatorSC.address);

      let delegatorInfo = await VECakeSC.delegator(delegatorSC.address);

      expect(delegatorInfo.delegatedCakeAmount).to.deep.eq(currentLockedBalanceOfUser2);
      expect(delegatorInfo.delegatedCakeAmount).to.deep.eq(userInfoOfUser2InVECake.cakeAmount);
      expect(delegatorInfo.delegatedCakeAmount).to.deep.eq(delegatorInfo.notInjectedCakeAmount);
    });

    it("Can not withdraw in cake pool after delegation lock expired", async function () {
      await VECakeSC.connect(user2).migrateFromCakePool();
      await VECakeSC.connect(user2).migrationConvertToDelegation(delegatorSC.address);

      let userInfoOfUser2InCakePool = await CakePoolSC.userInfo(user2.address);

      await time.increaseTo(userInfoOfUser2InCakePool.lockEndTime.add(1).toNumber());

      await expectRevert.unspecified(CakePoolSC.connect(user3).withdraw(userInfoOfUser2InCakePool.shares));
    });

    it("Can not delegate after migration limit time", async function () {
      await VECakeSC.connect(user2).migrateFromCakePool();

      let now = (await time.latest()).toString();
      let limitTimeOfConvert = await VECakeSC.limitTimeOfConvert();
      let targetTimestamp = BigNumber.from(now).add(limitTimeOfConvert);
      await time.increaseTo(targetTimestamp.toNumber());

      await expectRevert(VECakeSC.connect(user2).migrationConvertToDelegation(delegatorSC.address), "Too late");
    });

    it("Can not delegate after lock expired in cake pool", async function () {
      await VECakeSC.connect(user2).migrateFromCakePool();

      let now = (await time.latest()).toString();
      let userInfoOfUser2InVECake = await VECakeSC.userInfo(user2.address);
      let lockEndTime = BigNumber.from(userInfoOfUser2InVECake.lockEndTime);
      await time.increaseTo(lockEndTime.add(1).toNumber());

      await expectRevert(
        VECakeSC.connect(user2).migrationConvertToDelegation(delegatorSC.address),
        "User lock expired"
      );
    });
  });

  describe("Delegator withdraw", () => {
    let delegatorSC;
    beforeEach(async function () {
      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("1"), 0);

      // deploy mock delegator smart contract
      const Delegator = await ethers.getContractFactoryFromArtifact(DelegatorArtifact);
      delegatorSC = await Delegator.deploy(VECakeSC.address, CakeTokenSC.address);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);
      let halfYear = BigNumber.from(now).add(YEAR.div(2));

      // add whitelist for delegator in VECakeSC
      await VECakeSC.setWhitelistedCallers([delegatorSC.address], true);
      // add delegator in VECakeSC
      await VECakeSC.updateDelegator(delegatorSC.address, true, halfYear);

      // create lock for delegator
      await CakeTokenSC.approve(delegatorSC.address, ethers.utils.parseUnits("1"));
      await delegatorSC.createLock(ethers.utils.parseUnits("1"), OneYear);

      // delegate from cake pool
      await VECakeSC.connect(user3).delegateFromCakePool(delegatorSC.address);
    });

    it("Delegator can not withdraw before injected all", async function () {
      let delegatorLockedBalance = await VECakeSC.locks(delegatorSC.address);

      await time.increaseTo(delegatorLockedBalance.end.add(1).toNumber());
      await expectRevert(delegatorSC.withdrawAll(delegatorSC.address), "Insufficient injection for delegator");
    });

    it("Delegator can withdraw after injected all", async function () {
      let delegatorLockedBalance = await VECakeSC.locks(delegatorSC.address);

      await time.increaseTo(delegatorLockedBalance.end.add(1).toNumber());

      let delegatorInfo = await VECakeSC.delegator(delegatorSC.address);
      await VECakeSC.injectToDelegator(delegatorSC.address, delegatorInfo.notInjectedCakeAmount);

      let cakeBalanceBeforeOfDelegator = await CakeTokenSC.balanceOf(delegatorSC.address);
      await delegatorSC.withdrawAll(delegatorSC.address);

      let cakeBalanceAfterOfDelegator = await CakeTokenSC.balanceOf(delegatorSC.address);

      expect(cakeBalanceAfterOfDelegator.sub(cakeBalanceBeforeOfDelegator)).to.deep.eq(
        delegatorInfo.delegatedCakeAmount.add(ethers.utils.parseUnits("1"))
      );
    });

    it("Delegator can not early withdraw before limit Timestamp For Early Withdraw", async function () {
      await VECakeSC.setEarlyWithdrawSwitch(true);
      await expectRevert(
        delegatorSC.earlyWithdraw(delegatorSC.address, ethers.utils.parseUnits("1")),
        "Forbid earlyWithdraw"
      );
    });

    it("Delegator can not early withdraw when amount exceed injected amount", async function () {
      await VECakeSC.setEarlyWithdrawSwitch(true);
      let delegatorInfo = await VECakeSC.delegator(delegatorSC.address);
      await time.increaseTo(BigNumber.from(delegatorInfo.limitTimestampForEarlyWithdraw).add(1).toNumber());
      await expectRevert(
        delegatorSC.earlyWithdraw(delegatorSC.address, ethers.utils.parseUnits("2")),
        "Delegator balance exceeded"
      );
    });

    it("Delegator can early withdraw after limit Timestamp For Early Withdraw", async function () {
      await VECakeSC.setEarlyWithdrawSwitch(true);
      let delegatorInfo = await VECakeSC.delegator(delegatorSC.address);
      await time.increaseTo(BigNumber.from(delegatorInfo.limitTimestampForEarlyWithdraw).add(1).toNumber());

      let cakeBalanceBeforeOfDelegator = await CakeTokenSC.balanceOf(delegatorSC.address);
      await delegatorSC.earlyWithdraw(delegatorSC.address, ethers.utils.parseUnits("1"));

      let cakeBalanceAfterOfDelegator = await CakeTokenSC.balanceOf(delegatorSC.address);

      expect(cakeBalanceAfterOfDelegator.sub(cakeBalanceBeforeOfDelegator)).to.deep.eq(ethers.utils.parseUnits("1"));
    });
  });

  describe("Normal user lock cake in VECake", () => {
    beforeEach(async function () {
      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("1"), 0);
    });

    it("Create lock", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      await VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear);

      let userInfoOfUser4InVECake = await VECakeSC.getUserInfo(user4.address);

      expect(userInfoOfUser4InVECake.amount).to.deep.eq(ethers.utils.parseUnits("1000"));

      expect(userInfoOfUser4InVECake.end).to.deep.eq(OneYear.div(WEEK).mul(WEEK));
    });

    it("Create lock, can only lock until future", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = BigNumber.from((await time.latest()).toString());

      await expectRevert(
        VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), now),
        "_unlockTime too old"
      );
    });

    it("Create lock, can only lock 4 year max", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let FourYear = BigNumber.from(now).add(YEAR.mul(4)).add(WEEK.mul(3));

      await expectRevert(
        VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), FourYear),
        "_unlockTime too long"
      );
    });

    it("Create lock, amount should be greater than zero", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      await expectRevert(VECakeSC.connect(user4).createLock(0, OneYear), "Bad _amount");
    });

    it("Create lock, can not lock when already lock", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear);

      await expectRevert(
        VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear),
        "Already locked"
      );
    });

    it("Increase Lock Amount", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      await VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear);

      let userInfoOfUser4InVECakeBefore = await VECakeSC.getUserInfo(user4.address);

      await VECakeSC.connect(user4).increaseLockAmount(ethers.utils.parseUnits("66.66"));

      let userInfoOfUser4InVECakeAfter = await VECakeSC.getUserInfo(user4.address);

      expect(userInfoOfUser4InVECakeAfter.amount.sub(userInfoOfUser4InVECakeBefore.amount)).to.deep.eq(
        ethers.utils.parseUnits("66.66")
      );
    });

    it("Increase Unlock Time", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      await VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear);

      await time.increase(YEAR.div(2).toNumber());

      let newUnlockTime = OneYear.add(YEAR.div(2));

      await VECakeSC.connect(user4).increaseUnlockTime(newUnlockTime);

      let userInfoOfUser4InVECake = await VECakeSC.getUserInfo(user4.address);

      expect(userInfoOfUser4InVECake.end).to.deep.eq(newUnlockTime.div(WEEK).mul(WEEK));
    });

    it("Can not Withdraw before lock expired", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      await VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear);

      await expectRevert(VECakeSC.connect(user4).withdrawAll(user4.address), "Lock not expired");
    });

    it("Withdraw after lock expired", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      await VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear);

      await time.increaseTo(OneYear.add(WEEK).toNumber());

      let cakeBalanceBeforeOfUser4 = await CakeTokenSC.balanceOf(user4.address);

      await VECakeSC.connect(user4).withdrawAll(user4.address);

      let cakeBalanceAfterOfUser4 = await CakeTokenSC.balanceOf(user4.address);

      let userInfoOfUser4InVECake = await VECakeSC.getUserInfo(user4.address);

      expect(cakeBalanceAfterOfUser4.sub(cakeBalanceBeforeOfUser4)).to.deep.eq(ethers.utils.parseUnits("1000"));
      expect(userInfoOfUser4InVECake.amount).to.deep.eq(ZERO);
      expect(userInfoOfUser4InVECake.end).to.deep.eq(ZERO);
    });

    it("Early Withdraw before lock expired", async function () {
      await VECakeSC.setEarlyWithdrawSwitch(true);

      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      await VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear);

      let cakeBalanceBeforeOfUser4 = await CakeTokenSC.balanceOf(user4.address);

      await VECakeSC.connect(user4).earlyWithdraw(user4.address, ethers.utils.parseUnits("88.88"));

      let cakeBalanceAfterOfUser4 = await CakeTokenSC.balanceOf(user4.address);

      let userInfoOfUser4InVECake = await VECakeSC.getUserInfo(user4.address);

      expect(cakeBalanceAfterOfUser4.sub(cakeBalanceBeforeOfUser4)).to.deep.eq(ethers.utils.parseUnits("88.88"));
      expect(userInfoOfUser4InVECake.amount).to.deep.eq(
        ethers.utils.parseUnits("1000").sub(ethers.utils.parseUnits("88.88"))
      );
    });

    it("Can not Early Withdraw after lock expired", async function () {
      await VECakeSC.setEarlyWithdrawSwitch(true);

      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      await VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear);

      await time.increaseTo(OneYear.add(WEEK).toNumber());

      await expectRevert(
        VECakeSC.connect(user4).earlyWithdraw(user4.address, ethers.utils.parseUnits("10")),
        "Too late"
      );
    });
  });

  describe("Comparison between migrated users and normal users", () => {
    beforeEach(async function () {
      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("1"), 0);
    });

    it("Same LockedBalance", async function () {
      // migrate from cake pool
      await VECakeSC.connect(user2).migrateFromCakePool();

      let userInfoOfUser2InVECake = await VECakeSC.getUserInfo(user2.address);

      // lock with same cake amount and end time
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);
      await VECakeSC.connect(user4).createLock(userInfoOfUser2InVECake.cakeAmount, userInfoOfUser2InVECake.lockEndTime);

      let LockedBalanceOfUser2InVECake = await VECakeSC.locks(userInfoOfUser2InVECake.cakePoolProxy);
      let LockedBalanceOfUser4InVECake = await VECakeSC.locks(user4.address);

      expect(LockedBalanceOfUser2InVECake.amount).to.deep.eq(LockedBalanceOfUser4InVECake.amount);
      expect(LockedBalanceOfUser2InVECake.end).to.deep.eq(LockedBalanceOfUser4InVECake.end);
    });

    it("Same balanceOf", async function () {
      // migrate from cake pool
      await VECakeSC.connect(user2).migrateFromCakePool();

      let userInfoOfUser2InVECake = await VECakeSC.getUserInfo(user2.address);

      // lock with same cake amount and end time
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);
      await VECakeSC.connect(user4).createLock(userInfoOfUser2InVECake.cakeAmount, userInfoOfUser2InVECake.lockEndTime);

      let balanceOfUser2 = await VECakeSC.balanceOf(user2.address);
      let balanceOfUser4 = await VECakeSC.balanceOf(user4.address);
      expect(balanceOfUser2).to.deep.eq(balanceOfUser4);
    });

    it("Same balanceOfAt , and balanceOfAt gradually decreases to zero", async function () {
      // migrate from cake pool
      await VECakeSC.connect(user2).migrateFromCakePool();

      let userInfoOfUser2InVECake = await VECakeSC.getUserInfo(user2.address);

      // lock with same cake amount and end time
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);
      await VECakeSC.connect(user4).createLock(userInfoOfUser2InVECake.cakeAmount, userInfoOfUser2InVECake.lockEndTime);
      let now = BigNumber.from((await time.latest()).toString());
      let nextWeek = now.add(WEEK);
      // first week
      let currentBlockNumber = BigNumber.from((await time.latestBlock()).toString());
      let balanceOfAtUser2 = await VECakeSC.balanceOfAt(user2.address, currentBlockNumber);
      let balanceOfAtUser4 = await VECakeSC.balanceOfAt(user4.address, currentBlockNumber);
      console.log("First week", balanceOfAtUser2.toString());
      expect(balanceOfAtUser2).to.deep.eq(balanceOfAtUser4);

      let beforeBalance = balanceOfAtUser2;

      // second week
      await time.increaseTo(nextWeek.toNumber());
      nextWeek = now.add(WEEK.mul(2));
      currentBlockNumber = BigNumber.from((await time.latestBlock()).toString());
      let secondWeekBlockNumber = currentBlockNumber;
      balanceOfAtUser2 = await VECakeSC.balanceOfAt(user2.address, currentBlockNumber);
      balanceOfAtUser4 = await VECakeSC.balanceOfAt(user4.address, currentBlockNumber);
      console.log("Second week", balanceOfAtUser2.toString());
      expect(balanceOfAtUser2).to.deep.eq(balanceOfAtUser4);
      expect(Number(beforeBalance)).to.gt(Number(balanceOfAtUser2));
      beforeBalance = balanceOfAtUser2;

      // third week
      await time.increaseTo(nextWeek.toNumber());
      currentBlockNumber = BigNumber.from((await time.latestBlock()).toString());
      balanceOfAtUser2 = await VECakeSC.balanceOfAt(user2.address, currentBlockNumber);
      balanceOfAtUser4 = await VECakeSC.balanceOfAt(user4.address, currentBlockNumber);
      console.log("third week", balanceOfAtUser2.toString());
      expect(balanceOfAtUser2).to.deep.eq(balanceOfAtUser4);
      expect(Number(beforeBalance)).to.gt(Number(balanceOfAtUser2));
      beforeBalance = balanceOfAtUser2;

      // tenth week
      nextWeek = now.add(WEEK.mul(10));
      await time.increaseTo(nextWeek.toNumber());
      currentBlockNumber = BigNumber.from((await time.latestBlock()).toString());
      balanceOfAtUser2 = await VECakeSC.balanceOfAt(user2.address, currentBlockNumber);
      balanceOfAtUser4 = await VECakeSC.balanceOfAt(user4.address, currentBlockNumber);
      console.log("tenth week", balanceOfAtUser2.toString());
      expect(balanceOfAtUser2).to.deep.eq(balanceOfAtUser4);
      expect(Number(beforeBalance)).to.gt(Number(balanceOfAtUser2));
      beforeBalance = balanceOfAtUser2;

      // twentieth week
      nextWeek = now.add(WEEK.mul(20));
      await time.increaseTo(nextWeek.toNumber());
      currentBlockNumber = BigNumber.from((await time.latestBlock()).toString());
      balanceOfAtUser2 = await VECakeSC.balanceOfAt(user2.address, currentBlockNumber);
      balanceOfAtUser4 = await VECakeSC.balanceOfAt(user4.address, currentBlockNumber);
      console.log("twentieth week", balanceOfAtUser2.toString());
      expect(balanceOfAtUser2).to.deep.eq(balanceOfAtUser4);
      expect(Number(beforeBalance)).to.gt(Number(balanceOfAtUser2));
      beforeBalance = balanceOfAtUser2;

      // forty week
      nextWeek = now.add(WEEK.mul(40));
      await time.increaseTo(nextWeek.toNumber());
      currentBlockNumber = BigNumber.from((await time.latestBlock()).toString());
      balanceOfAtUser2 = await VECakeSC.balanceOfAt(user2.address, currentBlockNumber);
      balanceOfAtUser4 = await VECakeSC.balanceOfAt(user4.address, currentBlockNumber);
      console.log("forty week", balanceOfAtUser2.toString());
      expect(balanceOfAtUser2).to.deep.eq(balanceOfAtUser4);
      expect(Number(beforeBalance)).to.gt(Number(balanceOfAtUser2));
      beforeBalance = balanceOfAtUser2;

      // lock expired
      nextWeek = now.add(WEEK.mul(60));
      await time.increaseTo(nextWeek.toNumber());
      currentBlockNumber = BigNumber.from((await time.latestBlock()).toString());
      balanceOfAtUser2 = await VECakeSC.balanceOfAt(user2.address, currentBlockNumber);
      balanceOfAtUser4 = await VECakeSC.balanceOfAt(user4.address, currentBlockNumber);
      console.log("lock expired", balanceOfAtUser2.toString());
      expect(balanceOfAtUser2).to.deep.eq(ZERO);
      expect(balanceOfAtUser2).to.deep.eq(balanceOfAtUser4);
      expect(Number(beforeBalance)).to.gt(Number(balanceOfAtUser2));
    });
  });

  describe("Migrated users can lock as normal users", () => {
    beforeEach(async function () {
      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("1"), 0);
      // migrate from cake pool
      await VECakeSC.connect(user2).migrateFromCakePool();

      await CakeTokenSC.connect(user2).approve(VECakeSC.address, ethers.constants.MaxUint256);
    });
    it("Create lock", async function () {
      let userInfoOfUser2InVECake = await VECakeSC.getUserInfo(user2.address);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);
      let lockAmount = ethers.utils.parseUnits("666");
      await VECakeSC.connect(user2).createLock(lockAmount, OneYear);

      userInfoOfUser2InVECake = await VECakeSC.getUserInfo(user2.address);

      expect(userInfoOfUser2InVECake.amount).to.deep.eq(lockAmount);
      expect(userInfoOfUser2InVECake.end).to.deep.eq(OneYear.div(WEEK).mul(WEEK));
    });

    it("Increase Lock Amount", async function () {
      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);
      let lockAmount = ethers.utils.parseUnits("666");
      await VECakeSC.connect(user2).createLock(lockAmount, OneYear);

      let userInfoOfUser2InVECakeBefore = await VECakeSC.getUserInfo(user2.address);

      let increaseAmount = ethers.utils.parseUnits("66.66");
      await VECakeSC.connect(user2).increaseLockAmount(increaseAmount);

      let userInfoOfUser2InVECakeAfter = await VECakeSC.getUserInfo(user2.address);

      expect(userInfoOfUser2InVECakeAfter.amount.sub(userInfoOfUser2InVECakeBefore.amount)).to.deep.eq(increaseAmount);
    });

    it("Increase Unlock Time", async function () {
      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);
      let lockAmount = ethers.utils.parseUnits("666");
      await VECakeSC.connect(user2).createLock(lockAmount, OneYear);

      await time.increase(YEAR.div(2).toNumber());

      let newUnlockTime = OneYear.add(YEAR.div(2));

      await VECakeSC.connect(user2).increaseUnlockTime(newUnlockTime);

      let userInfoOfUser2InVECake = await VECakeSC.getUserInfo(user2.address);

      expect(userInfoOfUser2InVECake.end).to.deep.eq(newUnlockTime.div(WEEK).mul(WEEK));
    });

    it("Withdraw after lock expired", async function () {
      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);
      let lockAmount = ethers.utils.parseUnits("666");
      await VECakeSC.connect(user2).createLock(lockAmount, OneYear);

      await time.increaseTo(OneYear.add(WEEK).toNumber());

      let cakeBalanceBeforeOfUser2 = await CakeTokenSC.balanceOf(user2.address);

      await VECakeSC.connect(user2).withdrawAll(user2.address);

      let cakeBalanceAfterOfUser2 = await CakeTokenSC.balanceOf(user2.address);

      let userInfoOfUser2InVECake = await VECakeSC.getUserInfo(user2.address);

      expect(cakeBalanceAfterOfUser2.sub(cakeBalanceBeforeOfUser2)).to.deep.eq(lockAmount);
      expect(userInfoOfUser2InVECake.amount).to.deep.eq(ZERO);
      expect(userInfoOfUser2InVECake.end).to.deep.eq(ZERO);
    });

    it("User balanceOf should be equal to the sum of user address and proxy address ", async function () {
      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);
      let lockAmount = ethers.utils.parseUnits("666");
      await VECakeSC.connect(user2).createLock(lockAmount, OneYear);

      let userInfoOfUser2InVECake = await VECakeSC.getUserInfo(user2.address);
      let balanceOfUser2 = await VECakeSC.balanceOfUser(user2.address);
      let balanceOfUser2Proxy = await VECakeSC.balanceOfUser(userInfoOfUser2InVECake.cakePoolProxy);
      let totalBalanceOfUser2 = await VECakeSC.balanceOf(user2.address);

      expect(balanceOfUser2.add(balanceOfUser2Proxy)).to.deep.eq(totalBalanceOfUser2);
    });

    it("User balanceOfAt should be equal to the sum of user address and proxy address ", async function () {
      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);
      let lockAmount = ethers.utils.parseUnits("666");
      await VECakeSC.connect(user2).createLock(lockAmount, OneYear);

      let userInfoOfUser2InVECake = await VECakeSC.getUserInfo(user2.address);

      now = BigNumber.from((await time.latest()).toString());
      let nextWeek = now.add(WEEK);

      // first week
      let currentBlockNumber = BigNumber.from((await time.latestBlock()).toString());
      let balanceOfAtUser2 = await VECakeSC.balanceOfAtUser(user2.address, currentBlockNumber);
      let balanceOfAtUser2Proxy = await VECakeSC.balanceOfAtUser(
        userInfoOfUser2InVECake.cakePoolProxy,
        currentBlockNumber
      );
      let totalBalanceOfAtUser2 = await VECakeSC.balanceOfAt(user2.address, currentBlockNumber);

      expect(balanceOfAtUser2.add(balanceOfAtUser2Proxy)).to.deep.eq(totalBalanceOfAtUser2);

      // second week
      await time.increaseTo(nextWeek.toNumber());
      nextWeek = now.add(WEEK.mul(2));
      currentBlockNumber = BigNumber.from((await time.latestBlock()).toString());
      balanceOfAtUser2 = await VECakeSC.balanceOfAtUser(user2.address, currentBlockNumber);
      balanceOfAtUser2Proxy = await VECakeSC.balanceOfAtUser(userInfoOfUser2InVECake.cakePoolProxy, currentBlockNumber);
      totalBalanceOfAtUser2 = await VECakeSC.balanceOfAt(user2.address, currentBlockNumber);
      expect(balanceOfAtUser2.add(balanceOfAtUser2Proxy)).to.deep.eq(totalBalanceOfAtUser2);

      // tenth week
      nextWeek = now.add(WEEK.mul(10));
      await time.increaseTo(nextWeek.toNumber());
      currentBlockNumber = BigNumber.from((await time.latestBlock()).toString());
      balanceOfAtUser2 = await VECakeSC.balanceOfAtUser(user2.address, currentBlockNumber);
      balanceOfAtUser2Proxy = await VECakeSC.balanceOfAtUser(userInfoOfUser2InVECake.cakePoolProxy, currentBlockNumber);
      totalBalanceOfAtUser2 = await VECakeSC.balanceOfAt(user2.address, currentBlockNumber);
      expect(balanceOfAtUser2.add(balanceOfAtUser2Proxy)).to.deep.eq(totalBalanceOfAtUser2);

      // forty week
      nextWeek = now.add(WEEK.mul(40));
      await time.increaseTo(nextWeek.toNumber());
      currentBlockNumber = BigNumber.from((await time.latestBlock()).toString());
      balanceOfAtUser2 = await VECakeSC.balanceOfAtUser(user2.address, currentBlockNumber);
      balanceOfAtUser2Proxy = await VECakeSC.balanceOfAtUser(userInfoOfUser2InVECake.cakePoolProxy, currentBlockNumber);
      totalBalanceOfAtUser2 = await VECakeSC.balanceOfAt(user2.address, currentBlockNumber);
      expect(balanceOfAtUser2.add(balanceOfAtUser2Proxy)).to.deep.eq(totalBalanceOfAtUser2);

      // lock expired
      nextWeek = now.add(WEEK.mul(60));
      await time.increaseTo(nextWeek.toNumber());
      currentBlockNumber = BigNumber.from((await time.latestBlock()).toString());

      balanceOfAtUser2 = await VECakeSC.balanceOfAtUser(user2.address, currentBlockNumber);
      balanceOfAtUser2Proxy = await VECakeSC.balanceOfAtUser(userInfoOfUser2InVECake.cakePoolProxy, currentBlockNumber);
      totalBalanceOfAtUser2 = await VECakeSC.balanceOfAt(user2.address, currentBlockNumber);
      expect(balanceOfAtUser2.add(balanceOfAtUser2Proxy)).to.deep.eq(totalBalanceOfAtUser2);
      expect(balanceOfAtUser2).to.deep.eq(ZERO);
      expect(balanceOfAtUser2Proxy).to.deep.eq(ZERO);
      expect(totalBalanceOfAtUser2).to.deep.eq(ZERO);
    });
  });

  describe("Owner operations", () => {
    beforeEach(async function () {
      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("1"), 0);
    });

    it("Set Early Withdraw", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      await VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear);

      let cakeBalanceBeforeOfUser4 = await CakeTokenSC.balanceOf(user4.address);

      await expectRevert(
        VECakeSC.connect(user4).earlyWithdraw(user4.address, ethers.utils.parseUnits("88.88")),
        "Forbid"
      );

      await VECakeSC.setEarlyWithdrawSwitch(true);

      await VECakeSC.connect(user4).earlyWithdraw(user4.address, ethers.utils.parseUnits("88.88"));

      let cakeBalanceAfterOfUser4 = await CakeTokenSC.balanceOf(user4.address);

      let userInfoOfUser4InVECake = await VECakeSC.getUserInfo(user4.address);

      expect(cakeBalanceAfterOfUser4.sub(cakeBalanceBeforeOfUser4)).to.deep.eq(ethers.utils.parseUnits("88.88"));
      expect(userInfoOfUser4InVECake.amount).to.deep.eq(
        ethers.utils.parseUnits("1000").sub(ethers.utils.parseUnits("88.88"))
      );
    });

    it("Set Limit Time Of Convert", async function () {
      let limitTimeOfConvert = await VECakeSC.limitTimeOfConvert();
      expect(limitTimeOfConvert).to.deep.eq(WEEK.mul(2));

      await VECakeSC.setLimitTimeOfConvert(WEEK.mul(6));
      limitTimeOfConvert = await VECakeSC.limitTimeOfConvert();
      expect(limitTimeOfConvert).to.deep.eq(WEEK.mul(6));
    });

    it("Set Early Withdraw Config", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      await VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear);

      let cakeBalanceBeforeOfUser4 = await CakeTokenSC.balanceOf(user4.address);

      await VECakeSC.setEarlyWithdrawSwitch(true);
      const newEarlyWithdrawBpsPerWeek = 100; // 1%
      const newRedistributeBps = 4000; // 40%
      const newTreasuryAddr = treasury.address;
      const newRedistributeAddr = redistributor.address;
      await VECakeSC.setEarlyWithdrawConfig(
        newEarlyWithdrawBpsPerWeek,
        newRedistributeBps,
        newTreasuryAddr,
        newRedistributeAddr
      );

      // ceil the week by adding 1 week first
      // uint256 remainingWeeks = (_prevLockEnd + WEEK - block.timestamp) / WEEK;
      // // calculate penalty
      // _penalty = (earlyWithdrawBpsPerWeek * remainingWeeks * _amount) / 10000;
      // // split penalty into two parts
      // uint256 _redistribute = (_penalty * redistributeBps) / 10000;
      const earlyWithdrawAmount = ethers.utils.parseUnits("100");
      let LockedBalanceOfUser4InVECake = await VECakeSC.locks(user4.address);
      let currentTimestamp = BigNumber.from((await time.latest()).toString());
      let remainingWeeks = BigNumber.from(LockedBalanceOfUser4InVECake.end).add(WEEK).sub(currentTimestamp).div(WEEK);
      const penalty = BigNumber.from(newEarlyWithdrawBpsPerWeek)
        .mul(remainingWeeks)
        .mul(earlyWithdrawAmount)
        .div(10000);

      // split penalty into two parts
      // uint256 _redistribute = (_penalty * redistributeBps) / 10000;
      const redistributeCakeAmount = penalty.mul(BigNumber.from(newRedistributeBps)).div(10000);

      await VECakeSC.connect(user4).earlyWithdraw(user4.address, earlyWithdrawAmount);

      const cakeBalanceOfTreasury = await CakeTokenSC.balanceOf(treasury.address);
      const accumRedistribute = await VECakeSC.accumRedistribute();

      let cakeBalanceAfterOfUser4 = await CakeTokenSC.balanceOf(user4.address);

      let userInfoOfUser4InVECake = await VECakeSC.getUserInfo(user4.address);

      expect(accumRedistribute).to.deep.eq(redistributeCakeAmount);
      expect(cakeBalanceOfTreasury).to.deep.eq(penalty.sub(redistributeCakeAmount));
      expect(cakeBalanceAfterOfUser4.sub(cakeBalanceBeforeOfUser4)).to.deep.eq(earlyWithdrawAmount.sub(penalty));
      expect(userInfoOfUser4InVECake.amount).to.deep.eq(ethers.utils.parseUnits("1000").sub(earlyWithdrawAmount));
    });

    it("redistribute, and Set Whitelisted Redistributors", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      await VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear);

      let cakeBalanceBeforeOfUser4 = await CakeTokenSC.balanceOf(user4.address);

      await VECakeSC.setEarlyWithdrawSwitch(true);
      const newEarlyWithdrawBpsPerWeek = 100; // 1%
      const newRedistributeBps = 4000; // 40%
      const newTreasuryAddr = treasury.address;
      const newRedistributeAddr = redistributor.address;
      await VECakeSC.setEarlyWithdrawConfig(
        newEarlyWithdrawBpsPerWeek,
        newRedistributeBps,
        newTreasuryAddr,
        newRedistributeAddr
      );

      const earlyWithdrawAmount = ethers.utils.parseUnits("100");
      let LockedBalanceOfUser4InVECake = await VECakeSC.locks(user4.address);
      let currentTimestamp = BigNumber.from((await time.latest()).toString());
      let remainingWeeks = BigNumber.from(LockedBalanceOfUser4InVECake.end).add(WEEK).sub(currentTimestamp).div(WEEK);
      const penalty = BigNumber.from(newEarlyWithdrawBpsPerWeek)
        .mul(remainingWeeks)
        .mul(earlyWithdrawAmount)
        .div(10000);

      const redistributeCakeAmount = penalty.mul(BigNumber.from(newRedistributeBps)).div(10000);

      await VECakeSC.connect(user4).earlyWithdraw(user4.address, earlyWithdrawAmount);

      const cakeBalanceOfTreasury = await CakeTokenSC.balanceOf(treasury.address);
      let accumRedistribute = await VECakeSC.accumRedistribute();

      await expectRevert(VECakeSC.connect(redistributor).redistribute(), "! wl redistributors");

      await VECakeSC.setWhitelistedRedistributors([redistributor.address], true);
      await VECakeSC.connect(redistributor).redistribute();
      const cakeBalanceOfRedistributor = await CakeTokenSC.balanceOf(redistributor.address);

      expect(cakeBalanceOfRedistributor).to.deep.eq(redistributeCakeAmount);
      expect(cakeBalanceOfRedistributor).to.deep.eq(accumRedistribute);
      accumRedistribute = await VECakeSC.accumRedistribute();
      expect(accumRedistribute).to.deep.eq(ZERO);
    });

    it("Set No Penalty For Early Withdraw", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      await VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("1000"), OneYear);

      let cakeBalanceBeforeOfUser4 = await CakeTokenSC.balanceOf(user4.address);

      await VECakeSC.setEarlyWithdrawSwitch(true);
      const newEarlyWithdrawBpsPerWeek = 100; // 1%
      const newRedistributeBps = 4000; // 40%
      const newTreasuryAddr = treasury.address;
      const newRedistributeAddr = redistributor.address;
      await VECakeSC.setEarlyWithdrawConfig(
        newEarlyWithdrawBpsPerWeek,
        newRedistributeBps,
        newTreasuryAddr,
        newRedistributeAddr
      );
      // setNoPenaltyForEarlyWithdraw for user4
      await VECakeSC.setNoPenaltyForEarlyWithdraw(user4.address, true);

      const earlyWithdrawAmount = ethers.utils.parseUnits("100");
      await VECakeSC.connect(user4).earlyWithdraw(user4.address, earlyWithdrawAmount);

      let cakeBalanceAfterOfUser4 = await CakeTokenSC.balanceOf(user4.address);

      const cakeBalanceOfTreasury = await CakeTokenSC.balanceOf(treasury.address);
      let accumRedistribute = await VECakeSC.accumRedistribute();

      expect(cakeBalanceOfTreasury).to.deep.eq(ZERO);
      expect(accumRedistribute).to.deep.eq(ZERO);
      expect(cakeBalanceAfterOfUser4.sub(cakeBalanceBeforeOfUser4)).to.deep.eq(earlyWithdrawAmount);
    });

    it("Set Emergency Withdraw Switch", async function () {
      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);
      const lockAmount = ethers.utils.parseUnits("1000");
      await VECakeSC.connect(user4).createLock(lockAmount, OneYear);

      let cakeBalanceBeforeOfUser4 = await CakeTokenSC.balanceOf(user4.address);

      await expectRevert(VECakeSC.connect(user4).emergencyWithdraw(), "Forbid emergency withdraw");

      await VECakeSC.setEmergencyWithdrawSwitch(true);
      await VECakeSC.connect(user4).emergencyWithdraw();

      let cakeBalanceAfterOfUser4 = await CakeTokenSC.balanceOf(user4.address);
      expect(cakeBalanceAfterOfUser4.sub(cakeBalanceBeforeOfUser4)).to.deep.eq(lockAmount);

      let LockedBalanceOfUser4InVECake = await VECakeSC.locks(user4.address);

      expect(LockedBalanceOfUser4InVECake.amount).to.deep.eq(ZERO);
      expect(LockedBalanceOfUser4InVECake.end).to.deep.eq(ZERO);
    });
  });
});
