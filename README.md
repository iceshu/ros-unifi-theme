# 网关

放在局域网里的 RouterOS 管理后台，界面和交互向 UniFi Network 靠拢（浅色 / 深色可切换）：打开就能看到路由器是否在线、互联网通不通、谁在用网、流量走向哪里；能改端口转发、防火墙、固定 IP、限速、WiFi、WireGuard、VLAN、网桥、路由、PPPoE、服务、计划任务、脚本、用户等设置；还有告警通知（飞书 / 钉钉 / 企业微信 / Telegram / Bark / ntfy / Webhook）、30 天流量历史、定时配置备份与对比、系统更新、诊断工具、连接与应用流量、安全检查、Web 终端和操作审计。数据和修改都通过 MikroTik RouterOS 7 的 REST API 完成，服务跑在你自己的 N100 上，数据存在一个 SQLite 文件里。

**用 RouterOS 账号登录，能做什么由这个账号决定。** 打开页面先登录；仪表用你输入的 RouterOS 账号去访问路由器，并读取该账号所在组的权限（`read`、`write`、`reboot` …）：只读组只能看，带 `write` 的组可以改配置，带 `reboot` 的组才看得到“重启”。路由器本身仍会按这个账号的权限拒绝越权操作。

默认按这台家里的路由器来写示例，地址都可以改：

- 路由器 `192.168.2.1`
- 局域网 `192.168.2.0/24`
- PPPoE 接口 `liantong`
- 物理广域网口 `ether0`
- 局域网桥 `bridge1`

浏览器不直连路由器。N100 上的小服务托管页面，把 `/rest` 转到路由器。登录的 RouterOS 密码只留在服务进程内存里（退出登录、闲置超时或重启后丢弃），浏览器只拿到一个 HttpOnly 会话 Cookie。

```text
浏览器  --Cookie-->  N100:8080  --REST + Basic（登录账号）-->  192.168.2.1/rest
```

## 先看安全

- **www 或 www-ssl 必须已经开着。** 这个项目不会替你启用它们。`www-ssl`（HTTPS）从 RouterOS 7.1 起就能用；明文 `www` 要 RouterOS 7.9 及以上。明文 HTTP 下登录密码会在 N100 与路由器之间以 Basic 认证传输，N100 和路由器都在你自己的局域网里时可以接受；更稳妥的是 `https://192.168.2.1`，自签证书再把 `ROUTEROS_TLS_INSECURE=true`。
- **按用途建账号和组。** 日常查看用只读组；需要改配置时用带 `write` 的组；不需要的权限不要给。仪表只会做下文“可修改的内容”里列出的操作，其它菜单（文件、证书、导入等）即使账号有权限也会被代理拒绝。
- **防失联保护。** 服务端在转发修改前会检查：禁用/删除仪表正在使用的接口、管理地址、所在网桥端口、`www`/`www-ssl` 服务，以及修改自己的账号和组，会直接拒绝；删除默认路由、禁用 input 链放行规则、新增 input 丢弃规则等风险操作会先弹窗确认。
- **终端**会以登录账号执行任意 RouterOS 命令（需要 `write`），每条命令都会写入审计（`password=`、`*-key=` 等参数值会被打码）。
- **不要把仪表暴露到公网。** 不要在路由器上做 8080 的端口转发，也不要把它挂到 WAN 地址上。需要的话把 `DASHBOARD_BIND` 设成 N100 的局域网地址。
- 登录失败会被限速：同一来源一分钟内失败 5 次后锁定一分钟，避免触发路由器自己的登录限制。

在路由器上建账号（这些命令要你自己在路由器上执行）。REST 需要 `api` 和 `rest-api` 两个策略：

```routeros
# 只读：只能查看
/user group add name=dash-read policy=read,api,rest-api
/user add name=viewer group=dash-read password="换成强密码"

# 可管理：能改端口转发、防火墙、DHCP、WiFi 等；加上 reboot 才能重启、升级
/user group add name=dash-admin policy=read,write,reboot,test,api,rest-api
/user add name=netadmin group=dash-admin password="换成强密码"
```

账号要能读 `/user` 和 `/user/group`（`read` 即可），仪表才能知道它有哪些权限；读不到时按钮照常显示，由路由器决定是否允许。按需追加：`test`（ping / traceroute / torch）、`ftp`（配置备份要写文件再读回）、`policy`（管理 RouterOS 用户和组）、`sensitive`（备份里包含密码等敏感值）。

建议把 Web 服务限制在局域网：

```routeros
/ip service set [find name=www] address=192.168.2.0/24
/ip service set [find name=www-ssl] address=192.168.2.0/24
```

## 在 N100 上跑起来

需要 Docker 和 Docker Compose，机器要能访问 `192.168.2.1`。

```bash
cp .env.example .env
```

编辑 `.env`：

```env
ROUTEROS_HOST=http://192.168.2.1
WAN_INTERFACES=liantong,ether0
LAN_INTERFACES=bridge1
DASHBOARD_BIND=0.0.0.0
DASHBOARD_PORT=8080
# 可选：后台流量采样用的只读账号，见下文
ROUTEROS_USER=viewer
ROUTEROS_PASSWORD=换成强密码
```

密码里如果有 `$`，在 `.env` 里写成 `$$`，否则 Compose 会把它当成变量。

```bash
docker compose up -d --build
```

然后在局域网里打开 `http://<N100 的地址>:8080`，用 RouterOS 账号登录。以后改了 `.env`，再执行一次 `docker compose up -d`。

容器里的健康检查只访问本机的 `/api/health`，路由器关掉时容器仍会保持运行，页面上会显示连不上的原因。

## 本地开发

需要 Node.js 22.13 或更新版本（用到内置的 `node:sqlite`）。

```bash
npm install
cp .env.example .env
npm run dev
```

打开 `http://localhost:5173`。开发服务器在收到 `/rest/*` 和 `/api/*` 时，用和生产环境同一份代理代码处理（登录、白名单、写操作校验都一样）。

没有路由器、只想看界面时：

```bash
DEMO_MODE=true npm run dev
```

演示模式下任意用户名和密码都能登录，账号拥有全部权限；所有修改只作用于服务进程内存里的演示数据，重启即恢复。页面顶部会一直写着「演示模式」。

生产构建也可以不经过 Docker：

```bash
npm run build
npm start
```

默认监听 `8080`。`npm start` 会读取当前目录的 `.env`。

## 页面

- **概览**：互联网 / 网关 / 客户端 / 系统资源四张状态卡；互联网流量曲线（5 分钟 / 1 小时 / 6 小时 / 24 小时 / 7 天 / 30 天，带峰值、平均和本时段用量）；流量最高的客户端；拓扑预览；客户端类型分布；接口实时速率；有会话时显示 PPP 会话。
- **拓扑**：互联网 → 网关 → 端口 / WiFi / WireGuard → 客户端的树状图。蓝色虚线流向客户端表示下载，青色表示上传，线越粗流量越大。拖动平移、滚轮缩放、悬停高亮整条链路，点击任意节点打开详情。
- **客户端**：DHCP 租约、仅 ARP 的主机和无线客户端合在一张表，带连接方式、实时速率和用量。详情面板里可以**重命名、固定 IP、限速、阻止上网**。
- **端口**：以太网口面板（颜色表示协商速率）与全部接口列表；可启用/禁用接口、编辑备注。
- **详情面板**：从任何表格行、拓扑节点、顶栏速率或搜索结果打开：实时速率与曲线、到互联网的连接路径、详细信息、原始字段，以及该对象能做的操作。
- **全局搜索**：`Ctrl K`（Mac 上 `⌘K`）。
- **防火墙**：新建 / 编辑 / 复制 / 删除 / 启用禁用 / 上移下移 filter 规则，可插入到指定规则之前；mangle 只读。
- **端口转发**：UniFi 式的端口转发表单（TCP / UDP / TCP+UDP、外部端口、转发到哪台设备、来源限制）。
- **NAT**：全部 srcnat / dstnat 规则的增删改和排序。
- **地址列表**、**DNS**（上游服务器与静态记录）、**DHCP**（固定分配）、**队列**（限速）：完整的增删改。
- **WiFi**：修改 SSID 和密码、启用/禁用无线接口，查看已连接设备（新 `wifi` 包和旧 `wireless` 包都支持）。
- **WireGuard**：增删改对端；可为新设备生成密钥并给出客户端配置和二维码（手机 WireGuard 直接扫码；私钥只显示一次，不保存）。
- **网关**（详情面板）：重命名路由器、重启（需要 `reboot` 权限，并输入路由器名称确认）。
- **事件与告警**（顶栏铃铛）：WAN 断线、接口掉线、WireGuard 对端长时间无握手、CPU / 内存过高、新设备上线、有 RouterOS 更新时产生事件，恢复后自动标记已恢复；同一状况只通知一次。
- **仪表设置**：通知渠道（飞书、钉钉（可加签）、企业微信群机器人、Telegram、Bark、ntfy、通用 Webhook），每个渠道可选最低级别和事件类型，可发送测试；告警规则的开关和阈值。令牌和签名密钥只存在服务端，页面只显示末 4 位。
- **连接**：完整连接表，按客户端 / 协议 / 状态 / 关键字过滤，目标地址用 DNS 缓存解析成域名。
- **应用**：按 DNS 缓存把连接归类到常见应用（哔哩哔哩、抖音、微信、Steam、YouTube…），显示每个应用的实时速率和使用它的客户端。
- **诊断工具**：ping、traceroute、torch（需要 `test` 权限）。
- **PPPoE 拨号**、**IP 地址**、**静态路由**、**VLAN**、**网桥**（含端口）、**接口列表**（含成员）：增删改、启用禁用；PPPoE 可一键重新拨号，密码只写不读。
- **安全检查**：检查未限制来源的管理服务、明文服务、默认 `admin` 账号、WAN 入站没有丢弃规则、DNS 对外开放、MAC 服务器、邻居发现、带宽测试服务、UPnP、SNMP `public`、代理、待安装更新等，给出 0–100 分、说明和修复命令。
- **配置备份**：每天 / 每周定时 `/export`，内容有变化才保存一版（忽略导出时间那一行）；任选两版对比差异、查看、下载 `.rsc`。不提供一键恢复：恢复请在终端或 WinBox 里 `/import`，以免一次误操作让路由器失联。
- **系统更新**：查看当前 / 最新版本、切换更新通道、检查更新、下载并安装（会重启，需要 `reboot` 权限并输入路由器名称确认）；RouterBOARD 固件升级。
- **服务**（www / ssh / winbox… 的端口、允许地址、启用禁用）、**计划任务**、**脚本**（可运行）、**时间**（时区、NTP）。
- **RouterOS 用户**：用户、组（策略勾选）、在线会话的管理，需要 `policy` 权限；不能改自己的账号和组。
- **终端**：在浏览器里执行 RouterOS 命令，带历史记录。
- **操作审计**：所有登录、修改、终端命令的记录（谁、何时、从哪个 IP、改了哪些字段，不记录字段值），可过滤、导出 CSV。
- **邻居**、**日志**：只读。
- **仪表状态**：当前登录账号及其权限、已安装包、服务端配置、常见连接错误说明。

单台客户端的速率与用量来自 `/ip/firewall/connection` 连接表，只统计当前活动连接，且只保留打开页面后的采样；接口曲线来自服务端的历史采样（见下文），刷新页面也不会丢。

互联网吞吐取 `WAN_INTERFACES` 里的 PPPoE 接口（默认 `liantong`）。`ether0` 是拨号的物理口，速率不再加一次，否则同一份流量会算两遍。

## 可修改的内容

代理只放行 `server/writes.mjs` 和 `server/features/*.mjs` 里列出的菜单、方法和字段，其余一律拒绝（403 / 400），不会到达路由器：

| 菜单 | 操作 |
| --- | --- |
| `/ip/firewall/filter`、`/ip/firewall/nat` | 新建（可 `place-before`）、修改、删除、`move` |
| `/ip/firewall/address-list` | 新建、修改、删除 |
| `/ip/dhcp-server/lease` | 新建、修改、删除、`make-static` |
| `/ip/dns` | `set`（上游服务器、允许远程请求、缓存大小） |
| `/ip/dns/static` | 新建、修改、删除 |
| `/queue/simple` | 新建、修改、删除 |
| `/interface` | 启用/禁用、备注 |
| `/interface/wifi`、`wifi/configuration`、`wifi/security` | SSID、密码、认证方式、启用/禁用 |
| `/interface/wireless`、`wireless/security-profiles` | SSID、WPA 预共享密钥、启用/禁用 |
| `/interface/wireguard/peers` | 新建、修改、删除 |
| `/system/identity` | `set name` |
| `/system/reboot` | 需要 `reboot` 权限 |
| `/ip/address`、`/ip/route`、`/interface/vlan`、`/interface/bridge`、`bridge/port`、`/interface/list`、`list/member`、`/interface/pppoe-client` | 新建、修改、删除 |
| `/ip/service` | 端口、允许地址、证书、启用/禁用 |
| `/system/scheduler`、`/system/script` | 新建、修改、删除；脚本可运行 |
| `/system/clock`、`/system/ntp/client` | 时区、自动时区、NTP 服务器 |
| `/user`、`/user/group` | 新建、修改、删除（需要 `policy` 权限） |
| `/system/package/update`、`/system/routerboard` | 检查更新、切换通道、安装（`reboot`）、固件升级 |

写请求必须是 `application/json`、不超过 64KB、不带查询参数，字段值只能是字符串（脚本内容等少数字段允许换行）。服务端在转发前检查登录账号是否有对应权限（`write`、`reboot`、`policy`），路由器再按自己的权限检查一次。密码、私钥、预共享密钥只能写入，读回时一律被删掉。

每次登录和写请求都会写入 SQLite 里的审计表（只记录字段名，不记录值），在“操作审计”页查看；同时输出到容器日志：

```text
[ros] WRITE netadmin PUT /rest/ip/firewall/nat 201 35ms
[ros] WRITE viewer PATCH /rest/interface/*1 denied 403 policy
```

## 代理行为

- 未登录时除了 `/api/health`、`/api/meta`、`/api/login` 之外的接口都返回 401。会话 Cookie 是 `HttpOnly`、`SameSite=Strict`，闲置超过 `SESSION_TTL_HOURS`（默认 12 小时）失效；路由器拒绝该账号（例如改了密码）时会话立即结束，页面回到登录。
- 读取只允许 GET / HEAD 和固定的路径白名单（`server/ros-proxy.mjs` 的基础列表加上各功能模块声明的菜单），例如 `/rest/system/*`、`/rest/interface/*`、`/rest/ip/*`、`/rest/queue/simple`、`/rest/ppp/active`、`/rest/log`、`/rest/user*`。
- 跨站请求（`Origin` 与 `Host` 不一致、`Sec-Fetch-Site` 为 cross-site / same-site）一律拒绝。
- 响应里的 `password`、`passphrase`、`private-key`、`preshared-key`、`*-pre-shared-key` 等字段（包括 `security.passphrase` 这样的内联写法）会删掉再交给浏览器。
- `monitor-traffic` 不使用。速率是用两次 `GET /rest/interface` 的 `rx-byte` / `tx-byte` 相减得到的，大约每 2 秒一次；其它菜单大约每 8 秒读一次，修改后立即重读。浏览器标签放到后台后会放慢。
- 后台历史采样器（`HISTORY_ENABLED=true`，默认开启）：每 5 秒 `GET /rest/interface` 一次，计算每个接口的速率写入内存环形缓冲；`/api/history` 提供最近 1 小时（5 秒粒度）和 24 小时（1 分钟粒度）的趋势；每分钟的平均值另外写进 SQLite，保留 30 天，供 7 天 / 30 天曲线使用，重启不丢。
- 后台任务（流量采样、告警检查、定时备份、更新检查）使用 `.env` 里的 `ROUTEROS_USER` / `ROUTEROS_PASSWORD`；没配置时借用最近活跃且权限够用的登录会话，没人登录时暂停。想让告警和备份 7×24 运行，就配置这组账号（备份需要 `read,write,ftp,test,api,rest-api`）。

RouterOS 的 REST 从 7.1beta4 开始提供，返回的 JSON 里数字和布尔也都是字符串。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `ROUTEROS_HOST` | 路由器原点，例如 `http://192.168.2.1` 或 `https://192.168.2.1`。不要写用户名、密码，也不要带 `/rest`。缺省就是 `http://192.168.2.1`。 |
| `ROUTEROS_USER` / `ROUTEROS_PASSWORD` | 可选。后台账号：流量采样、告警、定时备份、更新检查。登录页面不使用它们。不要提交 `.env`。 |
| `ROUTEROS_TLS_INSECURE` | `true` 时跳过这台路由器的 TLS 证书校验。 |
| `WAN_INTERFACES` / `LAN_INTERFACES` | 逗号分隔。默认 `liantong,ether0` 和 `bridge1`。 |
| `SESSION_TTL_HOURS` | 登录会话闲置多久失效，默认 12。 |
| `DEMO_MODE` | `true` 时不访问路由器，任意账号可登录，修改只作用于内存中的演示数据。 |
| `DASHBOARD_BIND` / `DASHBOARD_PORT` | 宿主机上的监听地址和端口，默认 `0.0.0.0:8080`。 |
| `ROUTEROS_TIMEOUT_MS` | 单次读取超时，默认 8000，限制在 1000 到 20000；写操作至少等 15 秒。 |
| `HISTORY_ENABLED` | 默认 `true`；设为 `false` 时关闭后台采样，`/api/history` 返回 404。 |
| `HISTORY_INTERVAL_MS` | 历史采样间隔，毫秒，默认 5000，限制在 2000 到 60000。 |
| `DATA_DIR` | SQLite 数据目录（设置、告警、审计、30 天流量、配置备份）。默认 `./data`；Docker 里是 `/app/data`，`docker-compose.yml` 已挂成卷 `dashboard-data`。 |

## 对不上号时

| 现象 | 可以看 |
| --- | --- |
| 登录提示用户名或密码错误 | 密码是否正确；该账号的组是否同时有 `api` 和 `rest-api`。 |
| 登录后看不到“新建”“编辑”按钮 | 该账号的组没有 `write`；“重启”需要 `reboot`。侧栏底部和“连接”页显示当前账号的权限。 |
| 操作提示没有权限 | 路由器按账号权限拒绝了这个操作。 |
| 连接被拒绝 | `www` 或 `www-ssl` 是否已经启用，地址和端口是否正确。 |
| 超时或不可达 | N100 能否 ping 通 `192.168.2.1`，中间有没有防火墙。 |
| 证书错误 | 改用 HTTP，或在确认是局域网自签证书后打开 `ROUTEROS_TLS_INSECURE`。 |
| 有的区块是空的 | 路由器没有这项功能，或这个账号看不到。WireGuard、WiFi、温度都属于这种情况，其它页面仍可用。 |

## 目录

- `src/` SolidJS + Tailwind 页面
- `server/ros-proxy.mjs` 登录、读取白名单和写操作代理，开发和生产共用
- `server/writes.mjs` 基础写操作清单；`server/features/*.mjs` 各功能（告警、维护、诊断、网络配置、系统、管理）的接口、读写白名单和后台任务
- `server/guard.mjs` 防失联检查；`server/db.mjs` SQLite（Node 内置 `node:sqlite`，需要 Node 22.13+）
- `server/auth.mjs` 会话与登录限速
- `server/history.mjs` 后台流量采样
- `server/demo.mjs` 演示数据（可写的内存副本）
- `server/index.mjs` 生产进程，同时托管构建好的页面
- `docker-compose.yml` 在 N100 上的一条命令部署
