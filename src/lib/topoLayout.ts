/** Pure layout for the topology tree: Internet → gateway → branches → clients. */
import type { DeviceKind } from "./model";
import type { Selection } from "./store";

export type NodeKind = "internet" | "gateway" | "port" | "wifi" | "wg" | "unplaced" | "client" | "peer" | "more";

export interface BranchInput {
  id: string;
  kind: "port" | "wifi" | "wg" | "unplaced";
  title: string;
  sub: string;
  up: boolean;
  /** Toward clients (interface TX) and toward the gateway (interface RX). */
  down?: number;
  upRate?: number;
  selection?: Selection;
  children: LeafInput[];
}

export interface LeafInput {
  id: string;
  kind: "client" | "peer";
  title: string;
  sub: string;
  online: boolean;
  down?: number;
  upRate?: number;
  deviceKind?: DeviceKind;
  selection: Selection;
  match: boolean;
}

export interface TNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  parent: string | null;
  title: string;
  sub: string;
  online: boolean;
  down?: number;
  upRate?: number;
  deviceKind?: DeviceKind;
  selection?: Selection;
  count?: number;
  match: boolean;
}

export interface TLink {
  id: string;
  from: string;
  to: string;
  base: string;
  downLane: string;
  upLane: string;
  down?: number;
  upRate?: number;
  up: boolean;
  mid: { x: number; y: number };
}

export interface Layout {
  nodes: TNode[];
  links: TLink[];
  width: number;
  height: number;
}

const ROOT_W = 236;
const ROOT_H = 60;
const BRANCH_W = 200;
const BRANCH_H = 60;
const LEAF_W = 196;
const LEAF_H = 46;
const INDENT = 24;
const COL_W = Math.max(BRANCH_W, LEAF_W + INDENT);
const COL_GAP = 28;
const LEAF_GAP = 10;
const Y_INTERNET = 0;
const Y_GATEWAY = 120;
const Y_BRANCH = 250;
const LANE = 3;
export const LEAF_CAP = 8;

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const ym = (y1 + y2) / 2;
  return `M${x1} ${y1}C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}`;
}

/** Trunk down the left of a column, rounded corner, then right into the leaf. */
function elbow(tx: number, y1: number, cy: number, cx: number, radius: number): string {
  return `M${tx} ${y1}V${cy - radius}Q${tx} ${cy} ${tx + radius} ${cy}H${cx}`;
}

export function layoutTopology(input: {
  internet: { title: string; sub: string; up: boolean };
  gateway: { title: string; sub: string; up: boolean };
  wan: { down?: number; upRate?: number; up: boolean };
  branches: BranchInput[];
  expanded: Set<string>;
}): Layout {
  const nodes: TNode[] = [];
  const links: TLink[] = [];
  const count = Math.max(1, input.branches.length);
  const width = count * COL_W + (count - 1) * COL_GAP;
  const cx = width / 2;

  nodes.push({ id: "internet", kind: "internet", x: cx - ROOT_W / 2, y: Y_INTERNET, w: ROOT_W, h: ROOT_H, parent: null, online: input.internet.up, title: input.internet.title, sub: input.internet.sub, selection: { type: "internet" }, match: true });
  nodes.push({ id: "gateway", kind: "gateway", x: cx - ROOT_W / 2, y: Y_GATEWAY, w: ROOT_W, h: ROOT_H, parent: "internet", online: input.gateway.up, title: input.gateway.title, sub: input.gateway.sub, selection: { type: "gateway" }, match: true });
  links.push({
    id: "internet>gateway",
    from: "internet",
    to: "gateway",
    base: `M${cx} ${Y_INTERNET + ROOT_H}V${Y_GATEWAY}`,
    downLane: `M${cx - LANE} ${Y_INTERNET + ROOT_H}V${Y_GATEWAY}`,
    upLane: `M${cx + LANE} ${Y_INTERNET + ROOT_H}V${Y_GATEWAY}`,
    down: input.wan.down,
    upRate: input.wan.upRate,
    up: input.wan.up,
    mid: { x: cx, y: (Y_INTERNET + ROOT_H + Y_GATEWAY) / 2 },
  });

  let height = Y_BRANCH + BRANCH_H;
  input.branches.forEach((branch, index) => {
    const x = index * (COL_W + COL_GAP);
    const bx = x + COL_W / 2;
    const anyMatch = branch.children.some((child) => child.match);
    nodes.push({ id: branch.id, kind: branch.kind, x: x + (COL_W - BRANCH_W) / 2, y: Y_BRANCH, w: BRANCH_W, h: BRANCH_H, parent: "gateway", online: branch.up, title: branch.title, sub: branch.sub, down: branch.down, upRate: branch.upRate, selection: branch.selection, count: branch.children.length, match: anyMatch || branch.children.length === 0 });
    const y1 = Y_GATEWAY + ROOT_H;
    links.push({
      id: `gateway>${branch.id}`,
      from: "gateway",
      to: branch.id,
      base: curve(cx, y1, bx, Y_BRANCH),
      downLane: curve(cx - LANE, y1, bx - LANE, Y_BRANCH),
      upLane: curve(cx + LANE, y1, bx + LANE, Y_BRANCH),
      down: branch.down,
      upRate: branch.upRate,
      up: branch.up,
      mid: { x: bx, y: Y_BRANCH - 18 },
    });

    const open = input.expanded.has(branch.id);
    const shown = open ? branch.children : branch.children.slice(0, LEAF_CAP);
    const tx = x + (COL_W - BRANCH_W) / 2 + 14;
    const top = Y_BRANCH + BRANCH_H;
    let y = top + 22;
    for (const child of shown) {
      const lx = x + (COL_W - BRANCH_W) / 2 + INDENT;
      const cy = y + LEAF_H / 2;
      nodes.push({ id: child.id, kind: child.kind, x: lx, y, w: LEAF_W, h: LEAF_H, parent: branch.id, online: child.online, title: child.title, sub: child.sub, down: child.down, upRate: child.upRate, deviceKind: child.deviceKind, selection: child.selection, match: child.match });
      links.push({
        id: `${branch.id}>${child.id}`,
        from: branch.id,
        to: child.id,
        base: elbow(tx, top, cy, lx, 8),
        downLane: elbow(tx - 2.5, top, cy + 2.5, lx, 10.5),
        upLane: elbow(tx + 2.5, top, cy - 2.5, lx, 5.5),
        down: child.down,
        upRate: child.upRate,
        up: child.online && branch.up,
        mid: { x: tx, y: cy },
      });
      y += LEAF_H + LEAF_GAP;
    }
    const hidden = branch.children.length - shown.length;
    if (hidden > 0 || (open && branch.children.length > LEAF_CAP)) {
      nodes.push({ id: `${branch.id}:more`, kind: "more", x: x + (COL_W - BRANCH_W) / 2 + INDENT, y, w: LEAF_W, h: 34, parent: branch.id, online: true, title: hidden > 0 ? `还有 ${hidden} 台` : "收起", sub: "", count: hidden, match: true });
      y += 34 + LEAF_GAP;
    }
    height = Math.max(height, y);
  });

  return { nodes, links, width, height };
}
