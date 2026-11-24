# biliup 登录机制分析

> 早期调查证据，不作为当前功能规范。


> 学习目标：搞清 biliup 如何实现扫码 / 账号密码登录，以及登录成功后程序做什么。
> 源码来源：`biliup/biliup` 仓库（Rust 为主架构），核心文件已下载到 `reference/` 目录。
> 对照源码：`本机研究源：danmu_tool/reference/credential.rs`、`本机研究源：danmu_tool/reference/login.rs`、`本机研究源：danmu_tool/reference/login.py`、`本机研究源：danmu_tool/reference/auth.rs`

---

## 一、架构总览

biliup 的登录代码分两层：

| 文件 | 作用 |
|------|------|
| `crates/biliup/src/uploader/credential.rs` | **核心实现**（664 行）。`Credential` 结构体封装所有登录方式 |
| `crates/stream-gears/src/login.rs` | 薄封装（73 行），把 `Credential` 的方法暴露成 PyO3 接口供 Python 调用 |
| `crates/stream-gears/tests/login.py` | Python 调用示例（10 行） |
| `crates/biliup-cli/src/server/api/auth.rs` | Web 服务层的用户认证（与 B站登录无关，是 biliup 自己 WebUI 的登录） |

关键认知：**`auth.rs` 是 biliup 自己 WebUI 的账号体系，不是 B站登录**。B站登录全部在 `credential.rs`。别搞混。

### 两大登录范式

biliup 的登录分为 **APP 端** 和 **Web 端** 两套，区别在于用哪套 API 密钥（appkey/appsec）和走哪组接口：

| 范式 | 模拟身份 | 密钥 | 登录方式 |
|------|---------|------|---------|
| APP 端 | 安卓客户端 / TV 客户端 | Android 或 BiliTV | 扫码、账密、短信 |
| Web 端 | 浏览器 | 无 appkey（用 SESSDATA/bili_jct） | 手动填 cookie、Web 二维码 |

APP 端登录拿到的是 `access_token` + cookie，功能更全；Web 端只拿 cookie。

---

## 二、核心概念：appkey/appsec 签名

APP 端所有请求都要签名，这是 B站移动端 API 的标准鉴权方式。

### 密钥（`本机研究源：danmu_tool/reference/credential.rs#L33-L55`）

```rust
AppKeyStore::BiliTV   => app_key "4409e2ce8ffd12b8", appsec "59b43e04ad6965f34319062b478f83dd"
AppKeyStore::Android  => app_key "783bbb7264451d82", appsec "2653583c8873dea268ab9386918b1d65"
AppKeyStore::BCutAndroid => app_key "5dce947fe22167f9", appsec "5491a31c6bc11fb764a9b1f8d4acf092"
```

这些是 B站官方客户端的密钥（逆向得来）。**注意合规风险**：`bilibili-API-collect` 项目就因收集这类非公开 API 认证机制被 B站律师函要求删库。

### 签名算法（`本机研究源：danmu_tool/reference/credential.rs#L624-L631`）

```rust
pub fn sign(param: &str, app_sec: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(format!("{}{}", param, app_sec));   // 参数字符串 + appsec
    format!("{:x}", hasher.finalize())                 // md5 十六进制
}
```

即 `sign = md5(urlencoded_params + appsec)`，然后把 `sign` 拼到参数里发请求。非常简单。

### 与 web 端 wbi 签名的区别

- **APP 端签名**（本节）：`md5(params + appsec)`，需要 appkey/appsec，简单。
- **Web 端 wbi 签名**（blivedm 用的那套）：需要从 nav 接口拿 img_key/sub_key，用固定索引表混淆成 mixin_key，再 md5，复杂得多。

biliup 的 APP 端登录避开了 wbi，所以签名实现极简。这是它登录代码干净的原因之一。

---

## 三、扫码登录（TV 端）实现

**这是最干净、最适合我们项目的方式。** 两步：申请二维码 -> 轮询确认。

### 第 1 步：申请二维码（`本机研究源：danmu_tool/reference/credential.rs#L499-L517`）

```rust
pub async fn get_qrcode(&self) -> Result<Value> {
    let mut form = json!({
        "appkey": AppKeyStore::BiliTV.app_key(),   // 用 TV 端密钥
        "local_id": "0",
        "ts": <当前时间戳>
    });
    let sign = Self::sign(&urlencoded, AppKeyStore::BiliTV.appsec());
    form["sign"] = sign;
    // POST https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code
}
```

返回 JSON 含 `data.auth_code`，前端用它生成二维码图片展示给用户扫。

### 第 2 步：轮询确认（`本机研究源：danmu_tool/reference/credential.rs#L428-L477`）

```rust
pub async fn login_by_qrcode(&self, value: Value) -> Result<LoginInfo> {
    let mut form = json!({
        "appkey": AppKeyStore::BiliTV.app_key(),
        "auth_code": value["data"]["auth_code"],
        "local_id": "0",
        "ts": <时间戳>
    });
    // 加签
    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;   // 每秒轮询一次
        // POST https://passport.bilibili.com/x/passport-tv-login/qrcode/poll
        match res {
            ResponseData { code: 0, data: Login(info) } => {
                self.set_cookie(&info.cookie_info);          // 登录成功，存 cookie
                break Ok(LoginInfo { platform: "BiliTV", ..info });
            }
            ResponseData { code: 86039, .. } => {
                // 二维码尚未确认，继续轮询（不 break）
            }
            _ => break Err(...)
        }
    }
}
```

**轮询状态码**：
- `code = 0`：用户已扫码确认，登录成功
- `code = 86039`：二维码尚未确认（等用户扫），继续轮询
- 其他：失败（二维码过期等）

### Python 实际调用流程（`本机研究源：danmu_tool/reference/login.py`）

```python
res = stream_gears.get_qrcode()           # 拿二维码
res = stream_gears.login_by_qrcode(res)   # 轮询直到成功
with open(f'{json.loads(res)["token_info"]["mid"]}.json', 'w') as f:
    f.write(res)                          # 存成 {用户mid}.json
```

**关键优势**：程序自己生成二维码 + 轮询，用户用 B站 App 扫一下即可。**完全不碰用户的浏览器，没有任何留痕问题。**

---

## 四、账号密码登录实现

三步：拿 RSA 公钥 -> 加密密码 -> 请求登录。

### 第 1 步：拿 RSA 公钥（`本机研究源：danmu_tool/reference/credential.rs#L519-L545`）

```rust
pub async fn get_key(&self) -> Result<(String, String)> {
    // GET https://passport.bilibili.com/x/passport-login/web/key
    // 返回 data.hash 和 data.key（key 是 RSA 公钥 PEM）
    Ok((hash, key))
}
```

### 第 2 步：RSA 加密密码（`本机研究源：danmu_tool/reference/credential.rs#L230-L238`）

```rust
let (key_hash, pub_key) = self.get_key().await?;
let pub_key = RsaPublicKey::from_public_key_pem(&pub_key)?;
let enc_data = pub_key.encrypt(
    &mut rng, Pkcs1v15Encrypt,
    (key_hash + password).as_bytes()    // 注意：是 hash + password 拼接后加密
);
let encrypt_password = general_purpose::STANDARD_NO_PAD.encode(enc_data);  // base64
```

**关键细节**：加密的不是密码本身，而是 `key_hash + password` 拼接串。用 PKCS1v15 填充，base64 编码（无 padding）。

### 第 3 步：请求登录（`本机研究源：danmu_tool/reference/credential.rs#L239-L280`）

```rust
let mut payload = json!({
    "actionKey": "appkey",
    "appkey": AppKeyStore::Android.app_key(),   // 安卓端
    "build": 6270200,
    "captcha": "", "challenge": "", "seccode": "", "validate": "",  // 验证码字段（空）
    "channel": "bili", "device": "phone", "mobi_app": "android", "platform": "android",
    "password": encrypt_password,
    "permission": "ALL", "subid": 1,
    "ts": <时间戳>,
    "username": username,
});
let sign = Self::sign(&urlencoded, AppKeyStore::Android.appsec());
payload["sign"] = sign;
// POST https://passport.bilibili.com/x/passport-login/oauth2/login
```

成功返回 `LoginInfo`（platform = "Android"）。

**账密登录的痛点**：`captcha`/`challenge`/`seccode`/`validate` 这几个验证码字段在这里是空的，意味着真实环境下 B站很可能要求滑块验证码（极验），需要额外处理。短信登录里能看到完整的验证码处理逻辑（见下节），账密登录这里被简化了。

---

## 五、短信登录实现（简述）

最复杂的一种，因为要处理滑块验证码。两个阶段：

### 阶段 1：发短信（`本机研究源：danmu_tool/reference/credential.rs#L362-L426`）

```rust
pub async fn send_sms_with_recaptcha(&self, phone, country_code, challenge, validate, recaptcha) {
    let payload = json!({
        "appkey": Android, "cid": country_code, "tel": phone_number,
        "buvid": &self.0.buvid, "ts": <时间戳>, ...
    });
    // POST https://passport.bilibili.com/x/passport-login/sms/send
    // 返回 captcha_key（成功）或 recaptcha_url（需要滑块验证）
}
```

`send_sms_handle_recaptcha`（`本机研究源：danmu_tool/reference/credential.rs#L321-L360`）处理需要验证码的情况：从 `recaptcha_url` 提取 `recaptcha_token`，调用外部 handler 完成滑块，拿到 `challenge`/`validate` 后重试。

### 阶段 2：验证码登录（`本机研究源：danmu_tool/reference/credential.rs#L282-L310`）

```rust
pub async fn login_by_sms(&self, code: u32, mut payload: Value) {
    payload["code"] = code;   // 用户收到的短信验证码
    // POST https://passport.bilibili.com/x/passport-login/login/sms
}
```

---

## 六、Web 端登录（简述）

### Web Cookie 登录（`本机研究源：danmu_tool/reference/credential.rs#L582-L591`）

用户手动提供 `SESSDATA` + `bili_jct`。内部巧妙的做法：用这两个 cookie 去自动确认一个 TV 端二维码，再走 `login_by_qrcode` 拿到完整 LoginInfo（含 access_token）。相当于把 web cookie "升级"成 APP 凭证。

### Web 二维码登录（`本机研究源：danmu_tool/reference/credential.rs#L547-L580`）

用已有 SESSDATA + DedeUserID，调老版 `qrcode/getLoginUrl` + `qrcode/login/confirm` + `qrcode/getLoginInfo` 三步，本质也是用现有 cookie 自动确认登录。

---

## 七、登录成功后得到什么

### 数据结构（`本机研究源：danmu_tool/reference/credential.rs#L101-L126`）

```rust
pub struct LoginInfo {
    pub cookie_info: serde_json::Value,   // cookie 列表（SESSDATA, bili_jct 等）
    pub sso: Vec<String>,
    pub token_info: TokenInfo,             // APP 端令牌
    pub platform: Option<String>,          // "Android" / "BiliTV"
}

pub struct TokenInfo {
    pub access_token: String,              // APP 端访问令牌
    pub expires_in: u32,                   // 过期时间
    pub mid: u64,                          // 用户 ID
    pub refresh_token: String,             // 刷新令牌
}
```

### 登录函数内部成功后做两件事

1. **`set_cookie`**（`本机研究源：danmu_tool/reference/credential.rs#L633-L647`）：把 `cookie_info["cookies"]` 数组里的每个 cookie 逐个塞进 client 的 cookie store，domain 设为 `bilibili.com`。
2. **返回 LoginInfo**，由调用方（`本机研究源：danmu_tool/reference/login.rs`）序列化成 JSON 写到 `cookies.json`：

```rust
// login.rs 里每个登录方式的收尾都是这样：
let file = std::fs::File::create("cookies.json")?;
serde_json::to_writer_pretty(&file, &info)?;
```

所以登录成功后，磁盘上多一个 `cookies.json`，里面是完整的 `LoginInfo`（cookie + token + mid + platform）。

---

## 八、登录成功后程序做什么

这是用户问的第二个重点。登录拿到凭证后，**后续每次启动程序走 `login_by_cookies`**（`本机研究源：danmu_tool/reference/credential.rs#L73-L91`）：

```rust
pub async fn login_by_cookies(file, proxy) -> Result<BiliBili> {
    let mut file = File::options().read(true).write(true).open(file)?;
    let login_info: LoginInfo = serde_json::from_reader(...)?;     // 1. 读 cookies.json

    let client: Credential = Credential::new(proxy);
    let need_refresh = client.validate_tokens(&login_info).await?; // 2. 验证 token 是否过期

    if need_refresh {
        let new_info = client.renew_tokens(login_info).await?;     // 3a. 过期则刷新
        file.rewind()?; file.set_len(0)?;
        serde_json::to_writer_pretty(..., &new_info)?;             // 3b. 刷新后写回文件
        bilibili_from_info(new_info, proxy)
    } else {
        bilibili_from_info(login_info, proxy)                      // 4. 不用刷新直接用
    }
}
```

### Token 验证与刷新

- **`validate_tokens`**（`本机研究源：danmu_tool/reference/credential.rs#L141-L185`）：GET `passport.bilibili.com/x/passport-login/oauth2/info`，带 access_key + 签名。返回 `refresh` 布尔值表示是否需要刷新。
- **`renew_token`**（`本机研究源：danmu_tool/reference/credential.rs#L187-L228`）：POST `passport.bilibili.com/x/passport-login/oauth2/refresh_token`，用 refresh_token 换新的 access_token + cookie。成功后 `set_cookie` 更新本地 cookie，并把新 LoginInfo 写回 `cookies.json`。

### 凭证最终用途

`login_by_cookies` 返回 `BiliBili` client（`本机研究源：danmu_tool/reference/credential.rs#L63-L71`），它内部持有带 cookie 的 HTTP client + login_info。biliup 用它做**视频投稿、录制**等业务。

对我们项目而言：**这个 `BiliBili` client 里的 cookie（尤其 SESSDATA）就是连弹幕的钥匙**--拿到 SESSDATA 后，走 blivedm 那套纯 HTTP 调 `getDanmuInfo`（带 wbi 签名）即可连弹幕，全程不碰浏览器。

### 流程时序

```
首次使用：
  get_qrcode -> 展示二维码 -> 用户扫码 -> login_by_qrcode 轮询
  -> 成功 -> set_cookie -> 写 cookies.json

后续每次启动：
  读 cookies.json -> validate_tokens
    -> 需刷新: renew_token -> 更新 cookies.json -> 得到 BiliBili client
    -> 无需刷新: 直接得到 BiliBili client
  -> 用 client（cookie）做业务（投稿 / 连弹幕 / ...）
```

---

## 九、对我们项目的启示

### 推荐方案：扫码登录 + 纯 HTTP 弹幕

把 biliup 的登录和 blivedm 的弹幕连接拼起来，正好解决咱们"留痕"问题：

| 环节 | 方案 | 来源 |
|------|------|------|
| 获取登录态 | **TV 端扫码登录** | biliup `get_qrcode` + `login_by_qrcode` |
| 存储凭证 | 写 `cookies.json`（含 SESSDATA + access_token） | biliup |
| 凭证刷新 | 启动时 `validate_tokens` + `renew_token` | biliup |
| 连弹幕 | 用 SESSDATA 纯 HTTP 调 `getDanmuInfo`（wbi 签名） | blivedm |

**为什么扫码登录最适合我们**：
1. **零留痕**：不启动浏览器、不访问直播间页面，从根上消除 Edge 历史 + B站观看历史两层留痕。
2. **全自动续期**：access_token + refresh_token 机制，不用频繁人工干预。
3. **用户体验好**：扫一次码就行，比手动复制 SESSDATA 友好。
4. **实现比账密简单**：不用处理 RSA 加密密码，更不用碰滑块验证码。

### 落地要解决的几个点

1. **语言移植**：biliup 是 Rust，咱们项目是 Node.js。扫码登录逻辑不复杂（两个 POST + 轮询 + md5 签名），可移植到 JS。需要 `md5` 和二维码生成库（如 `qrcode`）。
2. **TV 端登录返回的 cookie 是否含 SESSDATA**：需实测确认。从 `set_cookie` 把所有 cookie 都收下看，大概率包含。若不含，退而用 web 端 wbi 路线（blivedm 已验证）。
3. **getDanmuInfo 的 wbi 签名**：blivedm 的 `_WbiSigner`（Python）可移植到 JS，约 60 行。
4. **合规风险**：appkey/appsec、wbi 签名、getDanmuInfo 都属非公开 API 机制，与被删库的 `bilibili-API-collect` 同类。需用户知情确认。

### 与现状对比

| | 现状（gift_ani_tool_gui） | 优化后 |
|--|--------------------------|--------|
| 登录态 | Puppeteer 复用真实 Edge profile | TV 扫码登录 |
| 拿 token | 访问直播间页面拦截响应 | 纯 HTTP 调 getDanmuInfo |
| Edge 留痕 | 有 | 无 |
| B站观看历史 | 有 | 无（机制推断，建议实测） |
| 凭证续期 | 50 分钟重走 Puppeteer | refresh_token 自动刷新 |
| 依赖 | Edge 浏览器 + Puppeteer | 仅 Node.js + md5 + qrcode 库 |

---

## 附：关键 B站接口清单

| 接口 | 用途 | 出处 |
|------|------|------|
| `POST /x/passport-tv-login/qrcode/auth_code` | 申请 TV 二维码 | credential.rs:511 |
| `POST /x/passport-tv-login/qrcode/poll` | 轮询扫码状态 | credential.rs:443 |
| `GET /x/passport-login/web/key` | 拿 RSA 公钥 | credential.rs:527 |
| `POST /x/passport-login/oauth2/login` | 账密登录 | credential.rs:263 |
| `POST /x/passport-login/sms/send` | 发短信验证码 | credential.rs:400 |
| `POST /x/passport-login/login/sms` | 短信验证码登录 | credential.rs:294 |
| `GET /x/passport-login/oauth2/info` | 验证 token 是否过期 | credential.rs:165 |
| `POST /x/passport-login/oauth2/refresh_token` | 刷新 token | credential.rs:211 |
| `GET /x/frontend/finger/spi` | 拿 web 端 buvid3/buvid4 | credential.rs:484 |
| `GET /xlive/web-room/v1/index/getDanmuInfo` | 拿弹幕 token（需 wbi） | blivedm web.py |
| `GET /x/web-interface/nav` | 拿 uid + wbi 密钥 | blivedm web.py |

所有 `passport.bilibili.com` 接口基址为 `https://passport.bilibili.com`。
