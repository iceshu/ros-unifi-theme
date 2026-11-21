/**
 * Domain-suffix → app name dictionary + port fallbacks.
 * Used server-side to classify connections by destination.
 */

export const APP_MAP = new Map([
  // 哔哩哔哩
  ["bilibili.com", "哔哩哔哩"],
  ["bilivideo.com", "哔哩哔哩"],
  ["bilivideo.cn", "哔哩哔哩"],
  ["acgvideo.com", "哔哩哔哩"],
  // 抖音 / TikTok
  ["douyin.com", "抖音"],
  ["douyinpic.com", "抖音"],
  ["douyinstatic.com", "抖音"],
  ["amemv.com", "抖音"],
  ["tiktok.com", "TikTok"],
  ["tiktokv.com", "TikTok"],
  ["musical.ly", "TikTok"],
  // 微信 / QQ / 腾讯
  ["weixin.qq.com", "微信"],
  ["wx.qq.com", "微信"],
  ["wechat.com", "微信"],
  ["qq.com", "QQ / 腾讯"],
  ["qpic.cn", "QQ / 腾讯"],
  ["qlogo.cn", "QQ / 腾讯"],
  ["gtimg.com", "QQ / 腾讯"],
  ["tencent.com", "QQ / 腾讯"],
  ["tencentcloud.com", "腾讯云"],
  ["cloud.tencent.com", "腾讯云"],
  // 腾讯视频
  ["v.qq.com", "腾讯视频"],
  ["video.qq.com", "腾讯视频"],
  ["vod.cdn.qcloud.com", "腾讯视频"],
  // 爱奇艺
  ["iqiyi.com", "爱奇艺"],
  ["iqiyipic.com", "爱奇艺"],
  ["71.am", "爱奇艺"],
  // 优酷
  ["youku.com", "优酷"],
  ["alikunlun.com", "优酷"],
  // 网易云音乐
  ["163.com", "网易"],
  ["netease.com", "网易"],
  ["music.163.com", "网易云音乐"],
  ["126.net", "网易"],
  // 淘宝 / 阿里 / 支付宝
  ["taobao.com", "淘宝"],
  ["tmall.com", "淘宝"],
  ["alipay.com", "支付宝"],
  ["alipayobjects.com", "支付宝"],
  ["alibaba.com", "阿里巴巴"],
  ["alicdn.com", "阿里 CDN"],
  ["aliyun.com", "阿里云"],
  ["aliyuncs.com", "阿里云"],
  ["alidns.com", "阿里云"],
  // 京东
  ["jd.com", "京东"],
  ["jdcloud.com", "京东云"],
  ["jdpay.com", "京东"],
  // 拼多多
  ["pinduoduo.com", "拼多多"],
  ["yangkeduo.com", "拼多多"],
  // 小红书
  ["xiaohongshu.com", "小红书"],
  ["xhscdn.com", "小红书"],
  // 微博
  ["weibo.com", "微博"],
  ["weibo.cn", "微博"],
  ["weibocdn.com", "微博"],
  ["sinaimg.cn", "微博"],
  ["sina.com.cn", "微博"],
  // 百度
  ["baidu.com", "百度"],
  ["baidubce.com", "百度云"],
  ["bdstatic.com", "百度"],
  // 华为云
  ["huaweicloud.com", "华为云"],
  ["myhuaweicloud.com", "华为云"],
  ["huawei.com", "华为"],
  // 小米
  ["mi.com", "小米"],
  ["miui.com", "小米"],
  ["xiaomi.com", "小米"],
  ["miot-spec.com", "小米"],
  // Apple / iCloud
  ["apple.com", "Apple"],
  ["icloud.com", "iCloud"],
  ["mzstatic.com", "Apple"],
  ["appattest.apple.com", "Apple"],
  // Microsoft / Windows Update
  ["microsoft.com", "Microsoft"],
  ["windowsupdate.com", "Windows Update"],
  ["msftconnecttest.com", "Microsoft"],
  ["msftncsi.com", "Microsoft"],
  ["live.com", "Microsoft"],
  ["microsoftonline.com", "Microsoft"],
  ["azureedge.net", "Azure CDN"],
  ["azure.com", "Azure"],
  // Steam
  ["steampowered.com", "Steam"],
  ["steamcontent.com", "Steam"],
  ["steamstatic.com", "Steam"],
  ["steam-chat.com", "Steam"],
  ["steamgames.com", "Steam"],
  // Epic
  ["epicgames.com", "Epic Games"],
  ["unrealengine.com", "Epic Games"],
  // PlayStation
  ["playstation.com", "PlayStation"],
  ["playstation.net", "PlayStation"],
  ["sony.com", "PlayStation"],
  // Xbox
  ["xbox.com", "Xbox"],
  ["xboxlive.com", "Xbox"],
  // Nintendo
  ["nintendo.com", "Nintendo"],
  ["nintendo.net", "Nintendo"],
  // YouTube / Google
  ["youtube.com", "YouTube"],
  ["youtu.be", "YouTube"],
  ["googlevideo.com", "YouTube"],
  ["google.com", "Google"],
  ["googleapis.com", "Google"],
  ["googleusercontent.com", "Google"],
  ["gstatic.com", "Google"],
  ["gmail.com", "Google"],
  ["googletagmanager.com", "Google"],
  // Netflix
  ["netflix.com", "Netflix"],
  ["nflxvideo.net", "Netflix"],
  ["nflxext.com", "Netflix"],
  // GitHub
  ["github.com", "GitHub"],
  ["githubusercontent.com", "GitHub"],
  ["githubassets.com", "GitHub"],
  // Cloudflare
  ["cloudflare.com", "Cloudflare"],
  ["cloudflare-dns.com", "Cloudflare"],
  ["cloudflarestorage.com", "Cloudflare"],
  ["cdnjs.cloudflare.com", "Cloudflare"],
  ["1dot1dot1dot1.cloudflare.com", "Cloudflare"],
  // Zoom
  ["zoom.us", "Zoom"],
  ["zoom.com", "Zoom"],
  ["zoomgov.com", "Zoom"],
  // Teams / Microsoft 365
  ["teams.microsoft.com", "Teams"],
  ["office.com", "Microsoft 365"],
  ["office365.com", "Microsoft 365"],
  ["sharepoint.com", "Microsoft 365"],
  // Telegram
  ["telegram.org", "Telegram"],
  ["t.me", "Telegram"],
  ["tdesktop.com", "Telegram"],
  // WhatsApp
  ["whatsapp.com", "WhatsApp"],
  ["whatsapp.net", "WhatsApp"],
  // Spotify
  ["spotify.com", "Spotify"],
  ["scdn.co", "Spotify"],
  ["spotifycdn.com", "Spotify"],
  // Twitch
  ["twitch.tv", "Twitch"],
  ["twitchapps.com", "Twitch"],
  ["jtvnw.net", "Twitch"],
  // Amazon / AWS
  ["amazon.com", "Amazon"],
  ["amazonaws.com", "AWS"],
  ["aws.amazon.com", "AWS"],
  ["cloudfront.net", "Amazon CloudFront"],
  // Akamai CDN
  ["akamai.com", "Akamai CDN"],
  ["akamaized.net", "Akamai CDN"],
  ["akamaihd.net", "Akamai CDN"],
  ["akamaitechnologies.com", "Akamai CDN"],
  // Quad9 DNS
  ["quad9.net", "Quad9 DNS"],
  // Other DNS
  ["one.one.one.one", "Cloudflare DNS"],
  ["dns.google", "Google DNS"],
  // VPN / Tunnel
  ["openvpn.net", "OpenVPN"],
  ["wireguard.com", "WireGuard"],
]);

/** Well-known port → app name fallback when no domain match found. */
export const PORT_MAP = new Map([
  [53, "DNS"],
  [123, "NTP"],
  [22, "SSH"],
  [80, "HTTP"],
  [443, "HTTPS"],
  [8080, "HTTP"],
  [8443, "HTTPS"],
  [21, "FTP"],
  [25, "SMTP"],
  [587, "SMTP"],
  [465, "SMTP"],
  [143, "IMAP"],
  [993, "IMAP"],
  [110, "POP3"],
  [995, "POP3"],
  [3389, "RDP"],
  [5900, "VNC"],
  [1194, "OpenVPN"],
  [51820, "WireGuard"],
  [1723, "PPTP VPN"],
  [1701, "L2TP VPN"],
  [500, "IPsec"],
  [4500, "IPsec"],
  [27015, "Steam"],
  [3074, "Xbox Live"],
  [3478, "STUN/TURN"],
  [5353, "mDNS"],
  [67, "DHCP"],
  [68, "DHCP"],
  [179, "BGP"],
]);

/**
 * Classify a domain name to an app name by longest-suffix match.
 * Returns null if no entry matches.
 */
export function classifyDomain(host) {
  if (!host) return null;
  const h = host.replace(/\.$/, "").toLowerCase();
  const labels = h.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const suffix = labels.slice(i).join(".");
    const app = APP_MAP.get(suffix);
    if (app) return app;
  }
  return null;
}

/** Classify by destination port number. Returns null if no entry matches. */
export function classifyPort(port) {
  if (!port || !Number.isFinite(port)) return null;
  return PORT_MAP.get(port) ?? null;
}

/** True if the address is in a private/loopback/link-local range. */
export function isPrivateIp(addr) {
  if (!addr) return false;
  if (addr === "::1" || addr === "localhost") return true;
  // IPv4
  const v4 = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  // IPv6 ULA / link-local
  const lower = addr.toLowerCase();
  return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

/**
 * Build IP→app lookup from DNS cache entries (GET /rest/ip/dns/cache).
 * Follows A/AAAA records; resolves CNAME chains up to 5 hops.
 * @param {Array<{name: string, type: string, address?: string, "data"?: string}>} cacheEntries
 * @returns {Map<string, string>}  ip → appName
 */
export function buildIpAppMap(cacheEntries) {
  // name → first app matched for that name
  const nameApp = new Map();
  // cname: name → target
  const cname = new Map();
  // ip → names pointing at it
  const ipNames = new Map();

  for (const entry of cacheEntries) {
    const name = (entry.name || "").toLowerCase();
    const type = (entry.type || "").toUpperCase();
    const address = entry.address || entry["data"] || "";
    if (!name) continue;
    if (type === "CNAME") {
      cname.set(name, address.toLowerCase().replace(/\.$/, ""));
    } else if (type === "A" || type === "AAAA") {
      if (!ipNames.has(address)) ipNames.set(address, []);
      ipNames.get(address).push(name);
    }
  }

  // Classify each known DNS name
  for (const [name] of [...ipNames.values()].flat().map((n) => [n])) {
    if (!nameApp.has(name)) {
      const app = classifyDomain(name);
      if (app) nameApp.set(name, app);
    }
  }
  // Also try CNAME sources
  for (const [src] of cname) {
    if (!nameApp.has(src)) {
      const app = classifyDomain(src);
      if (app) nameApp.set(src, app);
    }
  }

  // Follow CNAME chains to propagate app labels
  function resolveApp(name, depth = 0) {
    if (depth > 5) return null;
    if (nameApp.has(name)) return nameApp.get(name);
    const target = cname.get(name);
    if (target) {
      const app = resolveApp(target, depth + 1);
      if (app) nameApp.set(name, app);
      return app;
    }
    return null;
  }
  for (const [src] of cname) resolveApp(src);

  // Build ip → app
  const result = new Map();
  for (const [ip, names] of ipNames) {
    for (const name of names) {
      const app = resolveApp(name);
      if (app) {
        result.set(ip, app);
        break;
      }
    }
  }
  return result;
}
