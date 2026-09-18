# 装到 iPhone / iPad 上

三条路,按"多久能用上"排序。**先读这一段再选:**

> 方案 A 和 B 的后端都跑在**你自己的电脑**上。电脑关机或断网,App 就连不上。
> 想让孩子随时能用,后端必须部署到服务器 —— 见最后一节。

| | 需要什么 | 花多久 | 能用多久 | 适合 |
|---|---|---|---|---|
| **A · Expo Go** | 一台电脑 + 同一个 WiFi | 5 分钟 | 一直可用(要开着电脑) | 自己和家人试用 |
| **B · 装成真 App** | Mac + Xcode + 免费 Apple ID | 30 分钟 | **7 天**,到期重装 | 想看真实图标和启动画面 |
| **C · TestFlight** | Apple 开发者账号 ¥688/年 | 半天 | 90 天一轮,可续 | 给别人测 / 上架 |

---

## 方案 A · Expo Go(推荐先用这个)

### 1. 电脑上开后端

```bash
cd kidvocab/backend
./run.sh
```

看到 `Uvicorn running on http://0.0.0.0:8000` 就对了。
`0.0.0.0` 是关键 —— 它表示接受局域网连接,如果写成 `127.0.0.1`,手机永远连不上。

### 2. 电脑上开 App 的开发服务

**另开一个终端窗口**(第一个别关):

```bash
cd kidvocab/mobile
npm install
npx expo start
```

终端会打印一个二维码和一行 `Metro waiting on exp://192.168.x.x:8081`。
那个 `192.168.x.x` 就是你电脑在局域网里的地址。

### 3. 手机/iPad 上装 Expo Go

App Store 搜 **Expo Go**,免费。

### 4. 扫码打开

- **iPhone / iPad**:用**系统相机**对着二维码扫,点弹出的横幅
- 或者打开 Expo Go → 手动输入终端里那行 `exp://...`

⚠️ **手机和电脑必须在同一个 WiFi。** 手机开热点给电脑用也行。
公司/学校网络常常隔离设备,连不通就换手机热点。

### 5. 首次会弹两个系统询问

| 弹窗 | 必须点 |
|---|---|
| "…想查找并连接到你本地网络上的设备" | **好** —— 不允许就连不上后端 |
| "…想访问你的相机 / 照片" | 用到拍照识别时才弹 |

第一个是 iOS 14 之后的本地网络隐私限制。我已经在 `app.json` 里加了
`NSLocalNetworkUsageDescription`(说明文案)和 `NSAllowsLocalNetworking`
(允许明文 HTTP 访问局域网),否则 iOS 会直接静默拒绝连接。

### 地址是自动找的,不用改文件

App 会从 Expo 的 manifest 里读出"是哪台机器给我发的代码",然后连那台机器的 8000 端口。
所以换 WiFi、换电脑都不用改配置。逻辑在 `mobile/src/api/client.ts` 的 `resolveApiBaseUrl()`。

想手动指定(比如后端在别的机器上):

```bash
cd kidvocab/mobile
EXPO_PUBLIC_API_URL=http://192.168.1.50:8000 npx expo start
```

### Expo Go 能不能跑全部功能?

能。这个 App 只用了 `expo-image-picker`(拍照/相册)、`expo-speech`(发音)、
`async-storage`(本地存 childId),三个都内置在 Expo Go 里,不需要自定义原生代码。

---

## 方案 B · 装成真正的 App(7 天)

需要 **Mac + Xcode**。用免费 Apple ID 签名,装上去的 App **7 天后过期**,重新跑一次命令即可续期;同一个免费账号最多同时装 3 个自签 App。

```bash
cd kidvocab/mobile
npx expo run:ios --device
```

第一次会:
1. 生成 `ios/` 原生工程(prebuild)
2. 让你从列表里选插着线的设备
3. 可能要求在 Xcode 里选一个 **Team** —— 打开 `ios/kidvocab.xcworkspace`,
   点 target → Signing & Capabilities → Team 选你的 Apple ID

装完之后:
- 首次打开会提示"未受信任的开发者" → iPhone 设置 → 通用 → VPN 与设备管理 → 信任
- 后端**仍然在你电脑上**,所以规则和方案 A 一样:同一 WiFi、电脑开着

这条路的唯一好处是能看到真实的图标、启动画面和 App 名字("我的词库")。

---

## 方案 C · TestFlight / App Store

需要 **Apple Developer Program**,¥688/年。

```bash
npm install -g eas-cli
eas login
cd kidvocab/mobile
eas build --platform ios          # 云端构建,不需要 Mac
eas submit --platform ios         # 传到 App Store Connect
```

在 App Store Connect 里把构建加进 TestFlight,就能邀请测试者(内部 100 人,外部 10000 人)。

**走这条路之前,后端必须先上线。** 见下一节 —— TestFlight 的用户不可能连你家电脑。

### 上架前还需要补的东西

这个 MVP 目前**不满足**上架要求,缺:

- 隐私政策网址(App Store 必填,涉及儿童的 App 审核更严)
- 儿童隐私合规:面向 13 岁以下的 App 受 COPPA / 中国《未成年人保护法》约束,
  需要家长同意流程和数据收集说明
- 账号体系 —— 目前是匿名 `child_id` 存在设备上,换设备数据就没了(规格 §32 里
  这是"先产生价值再注册"的有意设计,但上架前要补上真正的账号)
- 真实的支付 —— 付费墙目前是模拟价格(规格 §49 的内测验证方式),
  上架必须接 Apple 内购,且 Apple 抽成 15–30%

---

## 让后端脱离你的电脑

方案 A/B 的体验断点是"电脑必须开着"。要解决:

1. 把 `backend/` 部署到任意云服务器(它是标准 FastAPI,`requirements.txt` 里没有特殊依赖)
2. 数据库从 SQLite 换成 PostgreSQL:改 `KIDVOCAB_DATABASE_URL`
3. 图片存储从本地磁盘换成对象存储:替换 `backend/app/storage.py`(只有这个文件碰文件系统)
4. **必须上 HTTPS** —— iOS 默认禁止明文 HTTP,局域网的豁免(`NSAllowsLocalNetworking`)
   对公网地址不生效
5. App 端指向它:

```bash
EXPO_PUBLIC_API_URL=https://api.你的域名.com npx expo start
```

或者写进 `app.json` 的 `extra.apiBaseUrl`。

---

## 连不上时按顺序查

| 现象 | 多半是 |
|---|---|
| App 显示"连接不上服务" | 后端没开,或者手机和电脑不在同一 WiFi |
| 扫码后 Expo Go 一直转圈 | 防火墙挡了 8081 端口;或网络隔离了设备(换手机热点) |
| 打开就白屏/报错 | 后端开了但 `--host` 写成了 `127.0.0.1`,改回 `0.0.0.0` |
| 第一次能连,重启后连不上 | 电脑的局域网 IP 变了 —— 重新 `npx expo start` 即可,地址是自动读的 |
| 拍照没反应 | 相机权限被拒过,去 设置 → 我的词库 → 相机 打开 |

**手动验证后端是否可达:** 用手机浏览器打开 `http://你电脑的IP:8000/health`,
应该看到 `{"status":"ok","ai_provider":"mock"}`。看不到就是网络问题,与 App 无关。

查电脑 IP:
- macOS:`ipconfig getifaddr en0`
- Windows:`ipconfig` 看"IPv4 地址"
