# How to read campaignId events?

## Introduction

Each of the three events to increase number of points for users or teams come with a `campaignId` parameter (uint256).

Its purpose is to allow subgraph reconciliation with the actual meaning behind each event for point increases (from `PancakeProfile`) to display on the front end.

Each `campaignId` has 4 components: prefix, code user, type, and YYMM.

| Pre-fix              | Code User | Type    | YYMM    |
| -------------------- | --------- | ------- | ------- |
| 1 digit (5, 6, or 8) | 2 digit   | 2 digit | 4 digit |

## Components

### Prefix

5: USER_POINTS_SINGLE <br/>
6: USER_POINTS_MULTIPLE<br/>
8: TEAM_POINTS <br/>

### CodeUser

10: MANUAL (operation conducted by an external address)<br/>
11: CONTRACT_1<br/>
12: CONTRACT_2<br/>
...

### Type

#### Example 1

01: TRADING_COMPETITION<br/>
02: SOCIALMEDIA_COMPETITION<br/>
...

#### Example 2 - IFO

01: IFO_1
02: IFO_2
...

### YYMM

0000: NOT_RELEVANT
2101: JANUARY_2021<br/>
2102: FEBRUARY_2022<br/>
2201: JANUARY_2022<br/>
...

## Examples

### Example 1

campaignId = `511020000`<br/>
`5` / `11` / `02` / `0000`<br/>

User points were increased as a result of a campaign:

- User (`5`)
- IFO (`11`)
- IFO number 2 (`02`)
- Unrelevant (`0000`)

### Example 2

campaignId = `810022102`<br/>
`8` / `10` / `02` / `2102`<br/>

Team points were increased as a result of a campaign:

- team (`8`)
- manual (`10`)
- SOCIAL_MEDIA(`02`)
- February 2021 (`2102`)
