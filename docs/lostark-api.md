# 로스트아크 오픈 API

공식 포털: <https://developer-lostark.game.onstove.com/>

이 문서는 **이 계산기가 실제로 쓰는 부분만** 적는다. 전체 명세가 필요하면 포털의
Swagger를 보면 되고, 그 원본은 아래 주소에서 JSON으로 바로 받을 수 있다.

```
https://developer-lostark.game.onstove.com/swagger-doc/endpoints/armories
https://developer-lostark.game.onstove.com/swagger-doc/endpoints/characters
https://developer-lostark.game.onstove.com/swagger-doc/endpoints/{news|auctions|markets|gamecontents}
```

포털 화면의 Swagger UI가 읽어 가는 것과 같은 파일이다. 게임 패치로 필드가 늘면
여기 적힌 것보다 그쪽이 먼저 맞는다.

---

## 접속

| | |
|---|---|
| Base URL | `https://developer-lostark.game.onstove.com` |
| 인증 | `Authorization: bearer {JWT}` |
| 형식 | `accept: application/json` |
| 제한 | **분당 100회.** 넘기면 `429` |

토큰은 포털에 스토브 계정으로 로그인해 직접 발급한다. `bearer` 접두사와 그 뒤의
공백까지 정확해야 한다 — 꺾쇠나 중괄호를 같이 붙이면 거부된다.

남은 횟수는 응답 헤더로 온다.

```
X-RateLimit-Limit      분당 할당량
X-RateLimit-Remaining  남은 횟수
X-RateLimit-Reset      다음 갱신 시각(epoch)
```

**다만 브라우저에서는 이 셋을 못 읽는다.** 서버가 `Access-Control-Expose-Headers`로
열어 주지 않아서 `response.headers.get(...)`이 늘 `null`이다. curl로는 보인다.

키에 한글이나 전각 문자가 섞이면 요청이 나가기도 전에 죽는다. HTTP 헤더는
ISO-8859-1만 받는데, 그때 브라우저가 던지는 말이
`Failed to read the 'headers' property` 라서 통신 오류처럼 읽힌다.
보내기 전에 걸러야 한다.

### CORS — 브라우저에서 바로 부를 수 있다

이 계산기는 서버가 없다. 그래서 확인해 봤다.

```
$ curl -i -H "Origin: http://localhost:5173" .../armories/characters/x/profiles
HTTP/1.1 401 Unauthorized
access-control-allow-origin: http://localhost:5173
access-control-allow-credentials: true

$ curl -i -X OPTIONS -H "Origin: http://localhost:5173" \
       -H "Access-Control-Request-Headers: authorization" ...
HTTP/1.1 200 OK
access-control-allow-headers: authorization
access-control-allow-origin: http://localhost:5173
```

Origin을 그대로 되돌려 주고, preflight가 `authorization` 헤더를 허용한다.
**프록시 서버가 필요 없다.** 토큰은 사용자 브라우저에만 남는다.

### 캐릭터 이름은 인코딩해서 넣는다

한글 이름이라 경로에 그대로 붙이면 안 된다. `encodeURIComponent`를 거친다.

---

## 엔드포인트 — ARMORIES

전부 `GET /armories/characters/{characterName}` 아래에 있다.

| 경로 | 내용 | 이 앱에서 |
|---|---|---|
| *(없음)* | 아래 전부를 한 번에 | **쓴다** — 호출 1회로 끝난다 |
| `/profiles` | 전투 특성·공격력·아이템 레벨 | 쓴다 |
| `/equipment` | 착용 장비 12부위 | 쓴다 |
| `/engravings` | 각인 | 쓴다 |
| `/arkpassive` | 아크 패시브 노드 | 쓴다 |
| `/arkgrid` | 아크 그리드 코어·젬 | 쓴다 |
| `/gems` | 보석 | 쓴다 |
| `/collectibles` | 수집품 | 안 쓴다 |
| `/cards` | 카드 | 안 쓴다 |
| `/combat-skills` | 스킬·트라이포드 | 안 쓴다 |
| `/avatars` `/colosseums` | 아바타 · 대결장 | 안 쓴다 |

인자 없는 `GET /armories/characters/{characterName}` 이 나머지를 전부 감싼 객체를
돌려준다. **분당 100회 제한이 있으므로 이걸 한 번 부르는 편이 낫다.**
`filters` 쿼리로 필요한 것만 고를 수도 있다.

```
GET /armories/characters/{name}?filters=profiles%2Bequipment%2Bengravings%2Barkpassive
```

### 응답 껍데기 — `ArmoryProfileAll`

```
ArmoryProfile    ArmoryEquipment[]  ArmoryAvatars[]  ArmorySkills[]
ArmoryEngraving  ArmoryCard         ArmoryGem        ArkPassive
ArkGrid          ColosseumInfo      Collectibles[]
```

> 존재하지 않는 캐릭터는 `200`에 본문 `null`로 온다. `404`가 아니다.

---

## 이 앱이 읽는 필드

### 1. `ArmoryProfile` — 전투 특성과 공격력

```
CharacterName  ServerName  CharacterClassName  CharacterLevel
ItemAvgLevel   CombatPower  CharacterImage
Stats: Stat[]        { Type, Value, Tooltip[] }
Tendencies: Tendency[] { Type, Point, MaxPoint }
```

`Stats[].Type` 은 한글이다 — `치명` `특화` `제압` `신속` `인내` `숙련`
`공격력` `최대 생명력`. `Value`는 **문자열**이고 천 단위 쉼표가 섞여 온다.
`Number(v)` 로는 못 읽으니 쉼표를 지우고 파싱한다.

`Tendencies`는 지성·담력·매력 같은 성향치다. 전투와 무관하니 안 읽는다.

**무기 공격력과 힘/민첩/지능은 여기 없다.** `Stats[].Tooltip` 안에 설명 문장으로
섞여 있거나, 장비 툴팁에서 뽑아야 한다. 아래 참고.

### 2. `ArmoryEquipment[]` — 무기 공격력 · 힘민지 · 연마 효과

```
{ Type, Name, Icon, Grade, Tooltip }
```

`Type`은 `무기` `투구` `상의` `하의` `장갑` `어깨` `목걸이` `귀걸이` `반지`
`어빌리티 스톤` `팔찌`. 귀걸이·반지는 둘씩이라 같은 `Type`이 두 번 나온다.

**`Tooltip`은 JSON이 통째로 문자열에 들어 있다.** 한 번 더 `JSON.parse` 해야 하고,
그 안은 `Element_000` … `Element_0NN` 으로 번호가 매겨진 상자들이다. 번호는
아이템마다 달라서 **위치로 찾으면 안 되고 내용으로 찾아야 한다.**

건질 것:

| 찾는 값 | 어디에 | 생김새 |
|---|---|---|
| 무기 공격력 | 무기 툴팁의 기본 효과 | `무기 공격력 +XX,XXX` |
| 힘/민첩/지능 | 방어구 툴팁의 기본 효과 | `힘 +X,XXX` / `민첩` / `지능` |
| 연마 효과 | 악세서리 툴팁 | `적에게 주는 피해 +2.00%` 등 |
| 팔찌 옵션 | 팔찌 툴팁 | 특성 수치와 효과 문장 |

값에 `<BR>`, `<FONT COLOR='#..'>` 같은 태그가 섞여 오므로 태그를 걷어낸 뒤
정규식으로 뽑는다.

### 3. `ArmoryEngraving` — 각인

```
Engravings[]         { Slot, Name, Icon, Tooltip }        ← 구 각인. 지금은 빈 배열
Effects[]            { Icon, Name, Description }
ArkPassiveEffects[]  { AbilityStoneLevel, Grade, Level, Name, Description }
```

아크 패시브 시대의 각인은 **`ArkPassiveEffects`** 에 있다.
`Name`이 각인 이름(`원한`), `Grade`가 등급(`유물` `전설`), `Level`이 1~4단계다.
이 앱의 `ENGRAVING_TIERS`(`legendary4`, `relic4` …)와 맞물린다.

### 4. `ArkPassive` — 아크 패시브 노드

```
Title  IsArkPassive
Points[]  { Name, Value, Tooltip, Description }
Effects[] { Name, Description, Icon, ToolTip }
```

`Points`는 `진화` `깨달음` `도약` 세 줄이고 `Value`가 보유 포인트다.
진화가 이 앱의 140포인트에 해당한다.

`Effects[]`가 실제로 찍은 노드다. `Name`이 티어(`진화` 등), `Description`에
노드 이름과 레벨이 들어온다. 노드 이름을 `NODE_LIBRARY`의 `name`과 맞춘다.

### 5. `ArkGrid` — 아크 그리드

```
Slots[]   { Index, Icon, Name, Point, Grade, Tooltip, Gems[] }
Effects[] { Name, Level, Tooltip }
```

`Slots`가 해·달·별 코어 세 개다. `Name`이 코어 이름(`현란한 공격` 등),
`Point`가 이 앱의 10/14/17~20 포인트다. 코어 단계는 `Grade`나 툴팁에서 읽는다.

### 6. `ArmoryGem` — 보석

```
Gems[]    { Slot, Name, Icon, Level, Grade, Tooltip }
Effects   { Description, Skills[] }
```

이 앱은 젬 레벨 하나만 쓴다(`arkGrid.gemLevel`). 착용 젬들의 레벨을 본다.

---

## 다른 섹션

### CHARACTERS

```
GET /characters/{characterName}/siblings
```

원정대의 캐릭터 목록. `{ ServerName, CharacterName, CharacterLevel,
CharacterClassName, ItemAvgLevel, ItemMaxLevel }`. 부캐를 고르게 할 때 쓴다.

### 그 밖에

`NEWS` `AUCTIONS` `MARKETS` `GAMECONTENTS`. 이 계산기와는 관계없다.

---

## 주의할 것

- **응답이 `null`일 수 있다.** 캐릭터가 없거나, 아크 패시브를 안 열었거나,
  전투 정보 공개를 꺼 뒀을 때. 배열도 `null`로 온다 — `?? []` 를 습관처럼 붙인다.
- **숫자가 문자열로 온다.** `"1,234"`, `"1,700.00"`. 쉼표를 지우고 읽는다.
- **툴팁은 두 번 파싱한다.** 문자열 안에 JSON, 그 안에 HTML.
- **분당 100회.** 한 캐릭터에 여러 번 부르지 말고 통합 엔드포인트를 쓴다.
- 필드가 늘거나 이름이 바뀌는 일이 있다. 없으면 조용히 넘어가되, 무엇을 못
  읽었는지는 화면에 남긴다.

---

## 공격력 공식 — API 값이 필요한 이유

계산기 곳곳에 `평면 무공 기준값 부재로 미반영` 이라 적힌 것들이 있었다.
팔찌 무기공격력 +9,000, 코어의 평면 공격력 같은 것들이다.

기준값이란 이것이다.

```
기본 공격력 = √(힘민지 × 무기 공격력 / 6)
공격력 = [ 기본 공격력 × (1 + 기본공격력%) + 평면 공격력 ] × (1 + 공격력%)
```

출처: [로스트아크 인벤 — 딜러 전투력 로직 분석](https://www.inven.co.kr/board/lostark/4821/106546)

여기서 두 가지가 따라 나온다.

1. **평면 증가는 기준값 없이 못 센다.** 무공 +9,000이 몇 %인지는 지금 무공이
   얼마인지를 알아야 정해진다. API가 그 값을 준다.
2. **무기 공격력 %는 제곱근으로 접힌다.** 무공 +3%는 공격력 +3%가 아니라
   `√1.03 − 1 = +1.49%` 다. 힘민지 %도 같다.

귀걸이 연마의 `공격력 상 +1.55%` 와 `무기 공격력 상 +3.00%` 가 실전에서
비슷하되 공격력 쪽이 근소하게 낫다고 알려진 것이 이 계산과 맞는다
(1.55% vs 1.49%).
