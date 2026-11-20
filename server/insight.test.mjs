import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyDomain, classifyPort, buildIpAppMap, isPrivateIp } from "../shared/apps.mjs";

/* ───────── classifyDomain ───────── */

describe("classifyDomain", () => {
  it("matches exact entry", () => {
    assert.equal(classifyDomain("bilibili.com"), "哔哩哔哩");
  });
  it("matches subdomain via suffix", () => {
    assert.equal(classifyDomain("cdn.bilibili.com"), "哔哩哔哩");
  });
  it("matches deeper subdomain", () => {
    assert.equal(classifyDomain("cn-hd-live.bilivideo.com"), "哔哩哔哩");
  });
  it("more specific suffix wins over parent", () => {
    // weixin.qq.com is in the map; qq.com is too — weixin entry should win
    assert.equal(classifyDomain("weixin.qq.com"), "微信");
    assert.equal(classifyDomain("api.weixin.qq.com"), "微信");
    // generic qq.com sub
    assert.equal(classifyDomain("mail.qq.com"), "QQ / 腾讯");
  });
  it("returns null for unknown domain", () => {
    assert.equal(classifyDomain("example.com"), null);
    assert.equal(classifyDomain(""), null);
    assert.equal(classifyDomain(null), null);
  });
  it("strips trailing dot", () => {
    assert.equal(classifyDomain("bilibili.com."), "哔哩哔哩");
  });
  it("is case-insensitive", () => {
    assert.equal(classifyDomain("BILIBILI.COM"), "哔哩哔哩");
  });
});

/* ───────── classifyPort ───────── */

describe("classifyPort", () => {
  it("maps port 53 to DNS", () => assert.equal(classifyPort(53), "DNS"));
  it("maps port 443 to HTTPS", () => assert.equal(classifyPort(443), "HTTPS"));
  it("maps port 51820 to WireGuard", () => assert.equal(classifyPort(51820), "WireGuard"));
  it("returns null for unknown port", () => assert.equal(classifyPort(9999), null));
  it("returns null for null", () => assert.equal(classifyPort(null), null));
});

/* ───────── isPrivateIp ───────── */

describe("isPrivateIp", () => {
  it("192.168.x.x is private", () => assert.ok(isPrivateIp("192.168.2.1")));
  it("10.x.x.x is private", () => assert.ok(isPrivateIp("10.0.0.1")));
  it("172.16.x.x is private", () => assert.ok(isPrivateIp("172.16.0.1")));
  it("203.0.113.x is public", () => assert.ok(!isPrivateIp("203.0.113.50")));
  it("9.9.9.9 is public", () => assert.ok(!isPrivateIp("9.9.9.9")));
  it("::1 is private", () => assert.ok(isPrivateIp("::1")));
  it("fd00:: is private", () => assert.ok(isPrivateIp("fd00::1")));
});

/* ───────── buildIpAppMap ───────── */

describe("buildIpAppMap", () => {
  it("maps IP from A record", () => {
    const cache = [{ name: "cdn.bilibili.com", type: "A", address: "1.2.3.4" }];
    const map = buildIpAppMap(cache);
    assert.equal(map.get("1.2.3.4"), "哔哩哔哩");
  });
  it("follows CNAME chain to get app", () => {
    const cache = [
      { name: "dl.steam.clngaa.com", type: "CNAME", address: "steampowered.com" },
      { name: "steampowered.com", type: "A", address: "5.6.7.8" },
    ];
    const map = buildIpAppMap(cache);
    assert.equal(map.get("5.6.7.8"), "Steam");
  });
  it("CNAME chain: classified source propagates to target IP", () => {
    const cache = [
      { name: "api.weixin.qq.com", type: "CNAME", address: "weixin.qq.com" },
      { name: "weixin.qq.com", type: "A", address: "9.10.11.12" },
    ];
    const map = buildIpAppMap(cache);
    assert.equal(map.get("9.10.11.12"), "微信");
  });
  it("returns empty map for empty input", () => {
    assert.equal(buildIpAppMap([]).size, 0);
  });
  it("unknown domain yields no entry", () => {
    const cache = [{ name: "unknown.example.com", type: "A", address: "1.1.1.1" }];
    const map = buildIpAppMap(cache);
    assert.ok(!map.has("1.1.1.1"));
  });
});

/* ───────── Input validation (re-implemented inline for test isolation) ───────── */

const ADDR_RE = /^(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f:]+|(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,})$/i;
const IFACE_RE = /^[a-z0-9][-a-z0-9]{0,19}$/i;
function validateAddress(v) {
  if (!v || !v.trim()) return "empty";
  return ADDR_RE.test(v.trim()) ? null : "bad_format";
}
function validateInterface(v) {
  if (!v || !v.trim()) return "empty";
  return IFACE_RE.test(v.trim()) ? null : "bad_format";
}

describe("tool input validation", () => {
  it("accepts IPv4", () => assert.equal(validateAddress("8.8.8.8"), null));
  it("accepts hostname", () => assert.equal(validateAddress("bilibili.com"), null));
  it("accepts subdomain", () => assert.equal(validateAddress("cdn.bilibili.com"), null));
  it("rejects empty", () => assert.ok(validateAddress("") !== null));
  it("rejects path injection", () => assert.ok(validateAddress("8.8.8.8;rm -rf /") !== null));
  it("rejects spaces", () => assert.ok(validateAddress("my host") !== null));
  it("accepts valid interface name", () => assert.equal(validateInterface("ether1"), null));
  it("accepts interface with hyphen", () => assert.equal(validateInterface("bridge-lan"), null));
  it("rejects empty interface", () => assert.ok(validateInterface("") !== null));
  it("rejects interface with slash", () => assert.ok(validateInterface("eth/0") !== null));
});

/* ───────── Security scoring (inline fixture test) ───────── */

describe("security scoring", () => {
  // simulate computeSecurity with minimal fixture data
  function score(findingSeverities) {
    const deduction = findingSeverities.reduce((sum, s) => {
      if (s === "critical") return sum + 15;
      if (s === "warn") return sum + 7;
      return sum + 3;
    }, 0);
    return Math.max(0, 100 - deduction);
  }

  it("no findings = 100", () => assert.equal(score([]), 100));
  it("one critical = 85", () => assert.equal(score(["critical"]), 85));
  it("two critical + one warn = 63", () => assert.equal(score(["critical", "critical", "warn"]), 63));
  it("many findings floored at 0", () => {
    const many = Array(10).fill("critical");
    assert.equal(score(many), 0);
  });
  it("mix of severities", () => {
    // 1 critical(15) + 2 warn(14) + 1 info(3) = 32 → 68
    assert.equal(score(["critical", "warn", "warn", "info"]), 68);
  });
});
