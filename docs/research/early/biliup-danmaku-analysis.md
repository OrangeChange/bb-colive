# biliup 弹幕库（danmaku）分析

> 早期调查证据，不作为当前功能规范。


> 学习目标：搞清 biliup 登录成功后除了录制/投稿还有什么功能，弹幕库是否涉及付费礼物。
> 源码：`biliup/biliup` 仓库 `crates/danmaku/`，核心文件已下载到 `reference/`。
> 对照源码：`本机研究源：danmu_tool/reference/danmaku_message.rs`、`本机研究源：danmu_tool/reference/danmaku_bilibili.rs`、`本机研究源：danmu_tool/reference/danmaku_wbi.rs`、`本机研究源：danmu_tool/reference/danmaku_e2e.rs`

---

## 一、弹幕库的定位

biliup 主业是**直播录制 + 视频投稿**。`danmaku` 弹幕库的定位是：**录制直播时，同步把弹幕记录成 XML 文件**（弹幕姬格式），供后期给投稿视频挂弹幕用。

从 `本机研究源：danmu_tool/reference/danmaku_e2e.rs` 可见用法：

```rust
let recorder = DanmakuRecorder::new(config)?;
let handle = recorder.start();   // 开始记录弹幕到 XML
tokio::time::sleep(Duration::from_secs(seconds)).await;
handle.stop().await?;
// 产出 XML 文件，含 <d>(弹幕) <s>(SC) <o>(礼物) 节点
```

**关键认知**：biliup 的弹幕库**只解析并记录事件，不做"达到阈值触发动画"这类业务**。动画触发是我们项目独有的逻辑。但它的**连接与解析实现**对我们极有参考价值。

### 多平台支持

`crates/danmaku/src/protocols/` 下每个平台一个文件：bilibili、douyin、douyu、huya、twitcasting、twitch、youtube。统一抽象成 `Platform` trait（`get_connection_info` / `heartbeat_config` / `decode_message`）。

---

## 二、支持的事件类型（含付费礼物）

`本机研究源：danmu_tool/reference/danmaku_message.rs` 定义 `DanmakuEvent` 枚举，5 类事件 + Other：

| 事件类型 | B站 cmd | 是否付费 | 关键字段 |
|---------|---------|---------|---------|
| `Chat` | `DANMU_MSG` | 否 | content, name, uid, color |
| `Gift` | `SEND_GIFT` | **是** | name, uid, gift_name, price, num |
| `SuperChat` | `SUPER_CHAT_MESSAGE` | **是** | name, uid, content, price |
| `GuardBuy` | `GUARD_BUY` | **是** | name, uid, gift_name, price, num |
| `Enter` | 进入房间 | 否 | name, uid |
| `Other` | 未识别 | - | raw_data |

**结论：biliup 弹幕库确实处理付费礼物**，覆盖礼物、SC、上舰三类，和咱们项目关心的事件高度重合。

### 与咱们项目（gift_ani_tool_gui）的事件覆盖对比

| 事件 | biliup | 咱们项目 | 差异 |
|------|--------|---------|------|
| 礼物 | `SEND_GIFT` | `SEND_GIFT` | 一致 |
| SC | `SUPER_CHAT_MESSAGE` | `SUPER_CHAT_MESSAGE` | 一致 |
| 上舰 | `GUARD_BUY` | `USER_TOAST_MSG` + `USER_TOAST_MSG_V2` | **协议版本不同** |
| 红包 | 未处理 | `POPULARITY_RED_POCKET_V2_START` | **咱们多了红包** |
| 盲盒/连击 | 未特殊处理 | 单独处理（`blind_gift`/`batch_combo_id`） | **咱们更细** |

上舰的差异要注意：`GUARD_BUY` 和 `USER_TOAST_MSG` 都是上舰事件，是 B站协议演进中 cmd 名变化。biliup 只跟新版 `GUARD_BUY`，咱们项目跟了 V1/V2 两个旧版本。如果咱们改用 biliup 路线，可能要补 `GUARD_BUY` 处理或验证 V2 是否已废弃。

---

## 三、B站弹幕协议实现（精华）

`本机研究源：danmu_tool/reference/danmaku_bilibili.rs` 是完整的纯 HTTP + WebSocket 实现，679 行，设计清晰。

### 连接流程（`get_connection_info`，`本机研究源：danmu_tool/reference/danmaku_bilibili.rs#L485-L512`）

```
1. 从 URL 提取房间号         extract_room_id (L146)
2. 短号转真实号              GET /room/v1/Room/room_init?id={short_id}  (L154)
3. 拿弹幕 token + WS 地址    getDanmuInfo（带 wbi 签名）  (L174)
4. 构造认证包                build_auth_packet  (L257)
5. 连 WS，发认证包，30s 心跳
```

### 拿 token（`get_danmu_info`，`本机研究源：danmu_tool/reference/danmaku_bilibili.rs#L174-L254`）

```rust
let mut params = BTreeMap::new();
params.insert("id", room_id);
params.insert("type", "0");
params.insert("web_location", "444.8");    // 多了个 web_location 参数
self.wbi_signer.sign(&mut params, headers).await?;   // wbi 签名
// GET /xlive/web-room/v1/index/getDanmuInfo?{signed_params}
// 解析 data.token 和 data.host_list[0] -> wss://{host}:{wss_port}/sub
```

**容错降级**（`本机研究源：danmu_tool/reference/danmaku_bilibili.rs#L182-L184`）：wbi 签名失败或 getDanmuInfo 返回错误码（如 -352 风控），降级到默认 `wss://broadcastlv.chat.bilibili.com/sub` + 空 token（匿名连接）。不会直接挂掉。

### 伪造 buvid3（`本机研究源：danmu_tool/reference/danmaku_bilibili.rs#L589-L606`）

```rust
fn generate_fake_buvid3() -> String {
    let timestamp = SystemTime::now()...as_nanos();
    let uuid = format!("{:032X}", timestamp);
    format!("{}-{}-{}-{}-{}infoc", &uuid[0..8], ...)   // UUID 格式 + "infoc" 后缀
}
```

**重要**：biliup 不访问 `www.bilibili.com` 首页拿真 buvid3，而是用时间戳伪造一个 UUID 格式的假 buvid3。比 blivedm 访问首页更省事、留痕更少。伪造的 buvid3 能被 B站接受（biliup 验证过），但我们移植时建议实测确认。

### 认证包（`build_auth_packet`，`本机研究源：danmu_tool/reference/danmaku_bilibili.rs#L257-L269`）

```rust
AuthData {
    uid, roomid,
    protover: 3,          // brotli 压缩
    platform: "web",
    auth_type: 2,         // type: 2
    key: token,           // getDanmuInfo 返回的 token
}
```

和咱们项目 server.js 的认证参数一致（`protover`、`platform`、`type`、`key`）。

### 二进制协议解析（`decode_packet`，`本机研究源：danmu_tool/reference/danmaku_bilibili.rs#L272-L318`）

16 字节头：`packet_len(4) | header_len(2) | version(2) | operation(4) | sequence(4)`

| version | 含义 | 处理 |
|---------|------|------|
| 0 (RAW_JSON) | 原始 JSON | 直接用 |
| 1 (POPULARITY) | 人气值 | 直接用 |
| 2 (ZLIB) | zlib 压缩 | `ZlibDecoder` 解压后递归解析 |
| 3 (BROTLI) | brotli 压缩 | `BrotliDecompress` 解压后递归解析 |

operation 码：`2`=心跳, `3`=心跳回复, `5`=通知(弹幕消息), `7`=认证, `8`=认证回复。

**这个二进制协议解析，咱们项目目前交给 `@laplace.live/ws` 库处理**。如果走纯 Node.js 自实现路线，biliup 这段是最直接的参考（虽然是 Rust，逻辑可逐行移植）。

---

## 四、事件字段解析详解

`parse_notification`（`本机研究源：danmu_tool/reference/danmaku_bilibili.rs#L321-L336`）按 `cmd` 分发：

### 礼物 `parse_gift`（`本机研究源：danmu_tool/reference/danmaku_bilibili.rs#L393-L413`）

```rust
name     = data.uname
uid      = data.uid
gift_name= data.giftName
price    = data.price          // 金瓜子原值（未除1000）
num      = data.num
content  = "{name}投喂了{num}个{gift_name}"
```

### SC `parse_super_chat`（`本机研究源：danmu_tool/reference/danmaku_bilibili.rs#L416-L432`）

```rust
name    = data.user_info.uname
uid     = data.uid
content = data.message
price   = data.price * 1000    // 元 -> 金瓜子（1元=1000金瓜子）
```

### 上舰 `parse_guard_buy`（`本机研究源：danmu_tool/reference/danmaku_bilibili.rs#L435-L452`）

```rust
name      = data.username
uid       = data.uid
gift_name = data.gift_name      // 注意：GUARD_BUY 用 gift_name
price     = data.price          // 金瓜子原值
num       = data.num
```

### 单位差异（移植时务必注意）

| 事件 | biliup 的 price | 咱们项目 server.js 的 price |
|------|----------------|---------------------------|
| 礼物 | 金瓜子原值 | `priceRaw / 1000`（转元） |
| SC | `price * 1000`（元转金瓜子） | 直接用元 |
| 上舰 | 金瓜子原值 | `priceRaw / 1000`（转元） |

biliup 统一存金瓜子，咱们项目统一存元。移植时别搞混单位。

### 上舰 cmd 差异

- biliup：`GUARD_BUY`，字段 `data.username` / `data.gift_name`
- 咱们项目：`USER_TOAST_MSG`(V1) / `USER_TOAST_MSG_V2`(V2)，字段 `data.username` / `data.role_name`（V1）或 `data.sender_uinfo.base.name` / `data.guard_info.role_name`（V2）

两边 cmd 名和字段路径都不同，是不同协议版本。需确认当前 B站主推哪个。

---

## 五、wbi 签名实现（`本机研究源：danmu_tool/reference/danmaku_wbi.rs`）

完整的 wbi 签名，200 行，和 blivedm 的 `_WbiSigner` 互为印证：

### KEY_MAP（`本机研究源：danmu_tool/reference/danmaku_wbi.rs#L19-L23`）

biliup 定义了 64 项，但 `create_mixin_key` 里 `take(32)` 只用前 32 项：

```
46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, ...
```

**前 32 项与 blivedm 的 `WBI_KEY_INDEX_TABLE` 完全一致**。两个独立项目实现相同，wbi 算法可信。

### 签名流程（`sign`，`本机研究源：danmu_tool/reference/danmaku_wbi.rs#L132-L177`）

```
1. update_key: GET /x/web-interface/nav 拿 wbi_img.img_url + sub_url
2. extract_key: 从 URL 末段去扩展名得 img_key / sub_key
3. create_mixin_key: (img+sub) 按 KEY_MAP 取前 32 字符
4. 签名:
   - params 加 wts=当前时间戳
   - 过滤每个值的 !'()* 字符
   - 按 key 字典序排序，urlencode
   - w_rid = md5(query_string + mixin_key)
   - params 加 w_rid
```

缓存 2 小时刷新一次 mixin_key。

### 三份 wbi 实现对照

| 来源 | 语言 | KEY_MAP | 备注 |
|------|------|---------|------|
| blivedm `_WbiSigner` | Python | 32 项 | 已验证可连 |
| biliup `WbiSigner` | Rust | 64 项取前 32 | 与 blivedm 前 32 项一致 |
| 咱们项目（待实现） | JS | 用 32 项 | 参考以上两份 |

三份实现等价，移植到 JS 约 60 行。

---

## 六、对我们项目的综合启示

### biliup 提供的两块可借鉴资产

| 资产 | 来源 | 对我们的价值 |
|------|------|------------|
| 扫码登录 | credential.rs | 获取登录态，零留痕（见登录分析文档） |
| 纯 HTTP 弹幕连接 | bilibili.rs + wbi.rs | 替代 Puppeteer，零留痕连弹幕 |

### 落地路线（登录 + 弹幕全链路）

```
扫码登录(TV端) ──拿 SESSDATA──> 存 cookies.json
                                        │
                                        ▼
              纯 HTTP 调 getDanmuInfo（wbi 签名 + 伪造 buvid3）
                                        │
                                        ▼
              WS 连 wss://broadcastlv.chat.bilibili.com/sub
                                        │
                                        ▼
              解析 SEND_GIFT / SC / GUARD_BUY / 红包
                                        │
                                        ▼
              阈值判断 -> 触发动画（咱们独有业务）
```

### 比 blivedm 多借鉴的两个巧思

1. **伪造 buvid3**：不访问 `www.bilibili.com` 首页，用时间戳生成 UUID 格式假 buvid3。进一步减少请求和留痕。
2. **getDanmuInfo 降级**：失败时匿名连接兜底，提升健壮性。

### 仍需实测验证的点

1. TV 端扫码返回的 cookie 是否含 SESSDATA（决定能否用于 web 端 getDanmuInfo）
2. 伪造的 buvid3 是否被 B站接受（biliup 验证过，但我们环境需确认）
3. 纯 HTTP 路线是否真的不产生 B站观看历史（机制推断，需对比实验）
4. 当前 B站上舰主推 `GUARD_BUY` 还是 `USER_TOAST_MSG_V2`（决定上舰事件怎么跟）

---

## 附：弹幕库关键常量与接口

| 项 | 值 | 出处 |
|----|----|------|
| 默认 WS URL | `wss://broadcastlv.chat.bilibili.com/sub` | bilibili.rs:39 |
| 心跳间隔 | 30 秒 | bilibili.rs:515 |
| protover | 3 (brotli) | bilibili.rs:262 |
| 认证 type | 2 | bilibili.rs:263 |
| room_init | `GET /room/v1/Room/room_init?id={short_id}` | bilibili.rs:156 |
| getDanmuInfo | `GET /xlive/web-room/v1/index/getDanmuInfo?id=&type=0&web_location=444.8` | bilibili.rs:195 |
| nav (wbi key) | `GET /x/web-interface/nav` | wbi.rs:107 |
| wbi 缓存 | 2 小时 | wbi.rs:26 |
| User-Agent | Chrome 120 Windows | bilibili.rs:36 |
| Origin/Referer | `https://live.bilibili.com` | bilibili.rs:124-128 |
