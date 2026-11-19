# 网关

放在局域网里的只读网络仪表。深色界面，打开就能看到路由器是否在线、互联网通不通、谁在用网。数据来自 MikroTik RouterOS 7 的 REST API。仪表跑在你自己的 N100 上，默认不创建、不修改、不删除路由器上的任何东西；可选写操作见下文。

默认按这台家里的路由器来写示例，地址都可以改：

- 路由器 `192.168.2.1`
- 局域网 `192.168.2.0/24`
- PPPoE 接口 `liantong`
- 物理广域网口 `ether0`
- 局域网桥 `bridge1`

浏览器不直连路由器。N100 上的小服务托管页面，并把 `/rest` 转到路由器。Basic 认证的用户名和密码只留在服务端的环境变量里，不会写进页面，也不会进 git。

```text
浏览器  --只发 GET-->  N100:8080  --GET + Basic-->  192.168.2.1/rest
```

## 先看安全

- **www 或 www-ssl 必须已经开着。** 这个项目不会替你启用它们。`www-ssl`（HTTPS）从 RouterOS 7.1 起就能用。明文 `www` 要 RouterOS 7.9 及以上。官方不建议在会被旁听的网络上开明文 `www`，因为 Basic 认证能被看到。N100 和路由器都在你自己的局域网里时，可以用 `http://192.168.2.1`；更稳妥的是 `https://192.168.2.1`，自签证书再把 `ROUTEROS_TLS_INSECURE=true`。
- **用一个只读账号。** 不要把完整管理员账号填进 `.env`。下面的命令要你自己在路由器上执行，仪表不会发送它们。
- **不要把仪表暴露到公网。** 谁能打开这个页面，谁就能通过它读取白名单里的路由器数据。不要在路由器上做 8080 的端口转发，也不要把它挂到 WAN 地址上。需要的话把 `DASHBOARD_BIND` 设成 N100 的局域网地址。

只读用户示例：

```routeros
/user group add name=dashboard policy=read,rest-api
/user add name=dashboard group=dashboard password="换成强密码" comment="lan-dashboard"
```

如果这台 RouterOS 还不认识 `rest-api` 这个策略，改用：

```routeros
/user group add name=dashboard policy=read,web
```

不要授予 `write`、`policy`、`sensitive`、`password`。

建议把 Web 服务限制在局域网。这同样要你自己执行：

```routeros
/ip service print where name~"www"
/ip service set [find name=www] address=192.168.2.0/24
/ip service set [find name=www-ssl] address=192.168.2.0/24
```

`disabled` 必须已经是 `no`。仪表发现连不上时只会说明原因。

## 在 N100 上跑起来

需要 Docker 和 Docker Compose，机器要能访问 `192.168.2.1`。

```bash
cp .env.example .env
```

编辑 `.env`，至少改掉密码。指向这台路由器的写法：

```env
ROUTEROS_HOST=http://192.168.2.1
ROUTEROS_USER=dashboard
ROUTEROS_PASSWORD=换成强密码
WAN_INTERFACES=liantong,ether0
LAN_INTERFACES=bridge1
DASHBOARD_BIND=0.0.0.0
DASHBOARD_PORT=8080
```

密码里如果有 `$`，在 `.env` 里写成 `$$`，否则 Compose 会把它当成变量。

```bash
docker compose up -d --build
```

然后在局域网里打开 `http://<N100 的地址>:8080`，例如 `http://192.168.2.50:8080`。以后改了 `.env`，再执行一次 `docker compose up -d`。

容器里的健康检查只访问本机的 `/api/health`，路由器关掉时容器仍会保持运行，页面上会显示连不上的原因。

## 本地开发

需要 Node.js 22 或更新版本。

```bash
npm install
cp .env.example .env
npm run dev
```

打开 `http://localhost:5173`。

`npm run dev` 启动 Vite。开发服务器在收到 `/rest/*` 和 `/api/*` 时，用和生产环境同一份代理代码转发：默认只允许 GET / HEAD，只允许下面列出的路径，Basic 认证从 `.env` 读取。浏览器里看不到密码。这就是开发时的 Vite 代理，不是让页面自己去请求 `192.168.2.1`。

没有路由器、只想看界面时：

```bash
DEMO_MODE=true npm run dev
```

页面顶部会一直写着「演示模式」。那些数字是程序里的样例，会随时间变化，好让速率曲线有东西可画。它们不是路由器上的实时数据。

生产构建也可以不经过 Docker：

```bash
npm run build
npm start
```

默认监听 `8080`。`npm start` 会读取当前目录的 `.env`。

## 页面

- **概览**：名称、RouterOS 版本、运行时间、CPU、内存、温度（有就显示，没有就写未报告）、PPPoE / 广域网状态、当前下载和上传，以及轮询得到的曲线。
- **设备**：DHCP 租约（主机名、IP、MAC、状态、最近出现），能对上的 ARP 会标在旁边。可搜索。
- **接口**：运行或禁用、类型、收发速率和字节、错误。广域网和局域网会分开标。
- **防火墙**：filter / mangle 标签页及 NAT 链接。写操作启用后可切换 filter 规则启用/禁用。
- **NAT**、**地址列表**：规则、地址、禁用状态及计数器。
- **DHCP**、**DNS**：服务器、网络、地址池、DNS 配置与静态记录。
- **邻居**、**队列**、**WiFi**：发现邻居、简单队列、WiFi 接口/配置/注册客户端；未安装 WiFi 菜单时显示空状态。
- **日志**：最近 200 条，支持文本搜索；请求仅取 time、topics、message。
- 接口与 DHCP 租约行可展开查看除 `.id` 外的全部返回字段；接口附带 ethernet 字段和 VLAN 表。概览在有会话时显示 PPP 会话。
- **路由** 和 **WireGuard**：接口能干净返回时就显示。WireGuard 默认只看状态，启用写操作后可切换 peer 启用/禁用；私钥不会出现在页面上。
- **连接**：已安装包、服务端配置了哪台路由器、账号有没有配（不显示密码），以及 www 未开、认证失败、主机不可达这几类错误。

互联网吞吐取 `WAN_INTERFACES` 里的 PPPoE 接口（默认 `liantong`）。`ether0` 是拨号的物理口，速率不再加一次，否则同一份流量会算两遍。

## 代理行为

- 默认只把 GET 和 HEAD 转到路由器。POST、PUT、PATCH、DELETE 返回 405。
- `monitor-traffic` 不使用。它要 POST，而且不带 `once` 时会一直挂到 REST 大约 60 秒超时。速率是用两次 `GET /rest/interface` 的 `rx-byte` / `tx-byte` 相减得到的，大约每 2 秒一次。系统、租约、防火墙等大约每 8 秒读一次。浏览器标签放到后台后会放慢。
- 路径白名单：`/rest/system/{resource,identity,clock,health,routerboard,package}`；`/rest/interface` 及其 `ethernet`、`bridge`、`bridge/port`、`list`、`list/member`、`pppoe-client`、`wireguard`、`wireguard/peers`、`vlan`、`wifi`、`wifi/configuration`、`wifi/registration-table`；`/rest/ip/{address,arp,dhcp-server,dhcp-server/lease,dhcp-server/network,pool,dns,dns/static,neighbor,firewall/filter,firewall/nat,firewall/mangle,firewall/address-list,route}`；`/rest/queue/simple`、`/rest/ppp/active`、`/rest/log`。花括号表示各独立路径。
- 响应里的 `password`、`private-key`、`preshared-key` 等字段会删掉再交给浏览器。
- 认证失败后会暂停大约 30 秒再试，避免触发路由器的登录限制。

RouterOS 的 REST 从 7.1beta4 开始提供，返回的 JSON 里数字和布尔也都是字符串。单条菜单（例如 `/system/resource`）通常是只含一个对象的数组。

## 写操作（默认关闭）

只有显式设置 `ROS_WRITE_ENABLED=true` 并重启服务后，才会显示接口、IPv4 防火墙 filter 规则、WireGuard peer 的启用/禁用按钮。第一次点击进入确认，5 秒内再点一次才执行；点击别处或超时取消。禁用接口或规则可能使你失联，请先确认管理链路。演示模式始终不执行写操作（503 `demo_readonly`）。

仅允许 `PATCH /rest/interface/<.id>`、`PATCH /rest/ip/firewall/filter/<.id>`、`PATCH /rest/interface/wireguard/peers/<.id>`，JSON 必须恰好为 `{ "disabled": "yes" }` 或 `{ "disabled": "no" }`，最大 64KB。未知路径、其它方法和查询参数拒绝；PUT/DELETE 创建和删除不在 v1 范围。防火墙 move 的精确 REST 请求体未从官方文档验证，未实现；DHCP make-static 同样不实现。

不支持创建/删除、重启/关机、用户管理、脚本、证书、文件操作、配置导入/导出、`/rest/tool/*` 或 NAT 开关。

启用前必须由管理员另建单独的 RouterOS 用户（`read,rest-api,write`），并把服务端 `.env` 的账号配置指向该用户；不要复用或升级只读 dashboard 用户，绝不授予 `policy` / `sensitive` / `password`，也不要使用管理员账号。**必须仅限 LAN，绝不公开暴露**：此代理没有独立的登录授权，能访问页面的人就能执行这三类操作。Docker 使用者需自行把 `ROS_WRITE_ENABLED` 传入容器环境（例如本地 Compose override），仅修改 `.env` 不会自动给已有 Compose 服务添加新环境变量。

每次写请求都会输出审计日志（不记录请求体或查询参数）：

```text
[ros] WRITE PATCH /rest/interface/*1 allowed 200 12ms
[ros] WRITE PATCH /rest/user/*1 denied 403 0ms
```

`allowed` 表示通过代理校验并尝试转发，不代表路由器执行成功；应同时查看状态码。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `ROUTEROS_HOST` | 路由器原点，例如 `http://192.168.2.1` 或 `https://192.168.2.1`。不要写用户名、密码，也不要带 `/rest`。缺省就是 `http://192.168.2.1`。 |
| `ROUTEROS_USER` / `ROUTEROS_PASSWORD` | 只读账号。不要提交 `.env`。 |
| `ROUTEROS_TLS_INSECURE` | `true` 时跳过这台路由器的 TLS 证书校验。 |
| `WAN_INTERFACES` / `LAN_INTERFACES` | 逗号分隔。默认 `liantong,ether0` 和 `bridge1`。 |
| `ROS_WRITE_ENABLED` | 默认 `false`；显式启用三个启用/禁用开关，必须使用单独的 write 用户且仅限 LAN。 |
| `DEMO_MODE` | `true` 时不访问路由器，页面标明演示数据。 |
| `DASHBOARD_BIND` / `DASHBOARD_PORT` | 宿主机上的监听地址和端口，默认 `0.0.0.0:8080`。 |
| `ROUTEROS_TIMEOUT_MS` | 单次读取超时，默认 8000，限制在 1000 到 20000。 |

## 对不上号时

| 现象 | 可以看 |
| --- | --- |
| 连接被拒绝 | `www` 或 `www-ssl` 是否已经启用，地址和端口是否正确。 |
| 认证失败 | 用户名、密码、是否具备 `read` 和 `rest-api`。 |
| 超时或不可达 | N100 能否 ping 通 `192.168.2.1`，中间有没有防火墙。 |
| 证书错误 | 改用 HTTP，或在确认是局域网自签证书后打开 `ROUTEROS_TLS_INSECURE`。 |
| 有的区块是空的 | 路由器没有这项功能，或这个只读账号看不到。WireGuard、温度都属于这种情况，其它页面仍可用。 |

## 目录

- `src/` SolidJS + Tailwind 页面
- `server/ros-proxy.mjs` 默认只读、可选受限写操作的反向代理，开发和生产共用
- `server/index.mjs` 生产进程，同时托管构建好的页面
- `docker-compose.yml` 在 N100 上的一条命令部署
