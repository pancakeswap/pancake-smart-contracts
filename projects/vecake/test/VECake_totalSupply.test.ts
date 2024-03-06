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
  let user5;

  before(async function () {
    [admin, user1, user2, user3, user4, user5] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const ERC20Mock = await ethers.getContractFactoryFromArtifact(ERC20MockArtifact);

    // deploy cake token
    const CakeToken = await ethers.getContractFactoryFromArtifact(CakeTokenArtifact);
    CakeTokenSC = await CakeToken.deploy();
    // mint cake for users
    await CakeTokenSC["mint(address,uint256)"](admin.address, ethers.utils.parseUnits("100000000000000"));
    await CakeTokenSC["mint(address,uint256)"](user1.address, ethers.utils.parseUnits("100000000000000"));
    await CakeTokenSC["mint(address,uint256)"](user2.address, ethers.utils.parseUnits("100000000000000"));
    await CakeTokenSC["mint(address,uint256)"](user3.address, ethers.utils.parseUnits("100000000000000"));
    await CakeTokenSC["mint(address,uint256)"](user4.address, ethers.utils.parseUnits("100000000000000"));
    await CakeTokenSC["mint(address,uint256)"](user5.address, ethers.utils.parseUnits("100000000000000"));

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

    //  approve cake for VECake
    await CakeTokenSC.connect(admin).approve(VECakeSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user1).approve(VECakeSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user2).approve(VECakeSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user3).approve(VECakeSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user5).approve(VECakeSC.address, ethers.constants.MaxUint256);

    await network.provider.send("evm_setAutomine", [false]);
  });

  afterEach(async () => {
    // await network.provider.send("hardhat_reset");
    await network.provider.send("evm_setAutomine", [true]);
  });

  describe("Check totalSupply", () => {
    beforeEach(async function () {
      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("1"), 0);
    });

    it("Total supply", async function () {
      let now = Number((await time.latest()).toString());

      let currectTimestamp = 1704326399;
      if (now >= currectTimestamp) {
        console.log("Test cases expired !!!");
      } else {
        await time.increaseTo(currectTimestamp);

        let user1UnlockTime = 1706745600; //
        await VECakeSC.connect(user1).createLock(ethers.utils.parseUnits("1000"), user1UnlockTime);

        let user2UnlockTime = 1761782400;
        await VECakeSC.connect(user2).createLock(ethers.utils.parseUnits("1000"), user2UnlockTime);

        let user3UnlockTime = 1706745600;
        await VECakeSC.connect(user3).createLock(ethers.utils.parseUnits("5000"), user3UnlockTime);

        await time.increase(1);

        let user4UnlockTime = 1730332800;
        await VECakeSC.connect(user4).createLock(ethers.utils.parseUnits("100000"), user4UnlockTime);

        let user5UnlockTime = 1730332800;
        await VECakeSC.connect(user5).createLock(ethers.utils.parseUnits("2500"), user5UnlockTime);

        await time.increase(1);

        let user1PointEpoch = await VECakeSC.userPointEpoch(user1.address);
        let user1PointHistory = await VECakeSC.userPointHistory(user1.address, user1PointEpoch);
        let balanceOfUser1 = await VECakeSC.balanceOf(user1.address);
        console.log("User1 bias:", balanceOfUser1, "slope: ", user1PointHistory.slope);

        let user2PointEpoch = await VECakeSC.userPointEpoch(user2.address);
        let user2PointHistory = await VECakeSC.userPointHistory(user2.address, user2PointEpoch);
        let balanceOfUser2 = await VECakeSC.balanceOf(user2.address);
        console.log("User2 bias:", balanceOfUser2, "slope: ", user2PointHistory.slope);

        let user3PointEpoch = await VECakeSC.userPointEpoch(user3.address);
        let user3PointHistory = await VECakeSC.userPointHistory(user3.address, user3PointEpoch);
        let balanceOfUser3 = await VECakeSC.balanceOf(user3.address);
        console.log("User3 bias:", balanceOfUser3, "slope: ", user3PointHistory.slope);

        let user4PointEpoch = await VECakeSC.userPointEpoch(user4.address);
        let user4PointHistory = await VECakeSC.userPointHistory(user4.address, user4PointEpoch);
        let balanceOfUser4 = await VECakeSC.balanceOf(user4.address);
        console.log("User4 bias:", balanceOfUser4, "slope: ", user4PointHistory.slope);

        let user5PointEpoch = await VECakeSC.userPointEpoch(user5.address);
        let user5PointHistory = await VECakeSC.userPointHistory(user5.address, user5PointEpoch);
        let balanceOfUser5 = await VECakeSC.balanceOf(user5.address);
        console.log("User5 bias:", balanceOfUser5, "slope: ", user5PointHistory.slope);

        let totalSupply = await VECakeSC.totalSupply();
        console.log("totalSupply:", totalSupply);

        let sum = balanceOfUser1.add(balanceOfUser2).add(balanceOfUser3).add(balanceOfUser4).add(balanceOfUser5);
        console.log("Sum :", sum);
        expect(totalSupply).to.deep.eq(sum);
      }
    });
  });
});
