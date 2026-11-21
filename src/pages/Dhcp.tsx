import { createMemo, createSignal, For, Show } from "solid-js";
import { ReadTable } from "../components/ReadData";
import { AddButton, ConfirmDialog, RowMenu } from "../components/form";
import { LeaseForm } from "../components/LeaseForm";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { ros } from "../lib/api";
import { dhcpStatusLabel, dhcpStatusTone, flag, type RosRecord } from "../lib/model";
import { runWrites } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";
import { sameMac } from "../lib/topology";

export function DhcpPage() {
  const dash = useDashboard();
  const [form, setForm] = createSignal<RosRecord | "new" | null>(null);
  const [deleteLease, setDeleteLease] = createSignal<RosRecord | null>(null);

  const sortedLeases = createMemo(() =>
    [...dash.leases()].sort((a, b) => {
      if (!flag(a.dynamic) && flag(b.dynamic)) return -1;
      if (flag(a.dynamic) && !flag(b.dynamic)) return 1;
      return (a.address || "").localeCompare(b.address || "");
    }),
  );

  const clientName = (lease: RosRecord) => {
    if (lease.comment) return lease.comment;
    const client = dash.clients().find(
      (c) => sameMac(c.mac, lease["mac-address"]) || (!!lease.address && c.ip === lease.address),
    );
    return client?.title || lease["host-name"] || "—";
  };

  const makeStatic = (lease: RosRecord) =>
    runWrites(dash, "已设为固定", [() => ros.command("/rest/ip/dhcp-server/lease", "make-static", { ".id": lease[".id"] })]);

  const doDelete = (lease: RosRecord) =>
    runWrites(dash, "已删除", [() => ros.remove("/rest/ip/dhcp-server/lease", lease[".id"])]);

  return (
    <div>
      <PageHeader title="DHCP" subtitle="DHCP 服务器与地址分配">
        <AddButton label="新建固定分配" onClick={() => setForm("new")} />
      </PageHeader>

      <section class="card table-wrap mb-4">
        <div class="card-head">
          <h2 class="card-title">地址分配</h2>
          <span class="text-[12.5px] text-muted">{dash.leases().length} 条</span>
        </div>
        <Show when={sortedLeases().length > 0} fallback={<EmptyState title={dash.ready() ? "暂无租约" : "正在读取"} compact />}>
          <table class="data-table">
            <thead>
              <tr>
                <th>名称 / 备注</th>
                <th>IP 地址</th>
                <th>MAC 地址</th>
                <th>类型</th>
                <th>状态</th>
                <th>服务器</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <For each={sortedLeases()}>
                {(lease) => (
                  <tr>
                    <td class="font-medium">{clientName(lease)}</td>
                    <td class="font-mono text-[12.5px]">{lease.address || "—"}</td>
                    <td class="font-mono text-[12px] text-muted">{lease["mac-address"] || "—"}</td>
                    <td>
                      <Pill tone={flag(lease.dynamic) ? "muted" : "accent"}>{flag(lease.dynamic) ? "动态" : "固定"}</Pill>
                    </td>
                    <td>
                      <Pill tone={dhcpStatusTone(lease.status)}>{dhcpStatusLabel(lease.status)}</Pill>
                    </td>
                    <td class="text-muted">{lease.server || "—"}</td>
                    <td>
                      <Show when={can("write")}>
                        <RowMenu
                          items={[
                            ...(flag(lease.dynamic) ? [{ label: "设为固定", onSelect: () => makeStatic(lease) }] : []),
                            ...(!flag(lease.dynamic) ? [{ label: "编辑", onSelect: () => setForm(lease) }] : []),
                            ...(!flag(lease.dynamic)
                              ? [{ label: "删除", danger: true as const, onSelect: () => setDeleteLease(lease) }]
                              : []),
                          ]}
                        />
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </section>

      <ReadTable title="DHCP 服务器" rows={dash.dhcpServers()} fields={["name", "interface", "address-pool", "lease-time", "disabled"]} />
      <ReadTable title="DHCP 网络" rows={dash.dhcpNetworks()} fields={["address", "gateway", "dns-server", "comment"]} />
      <ReadTable title="地址池" rows={dash.pools()} fields={["name", "ranges", "next-pool"]} />

      <Show when={form() !== null}>
        <LeaseForm
          lease={form() === "new" ? undefined : (form() as RosRecord)}
          onClose={() => setForm(null)}
        />
      </Show>

      <Show when={deleteLease()}>
        {(lease) => (
          <ConfirmDialog
            title="删除固定分配"
            message={
              <>
                <p>将删除 <strong>{lease().address}</strong> 的静态租约。</p>
                <p class="mt-2 text-[13px] text-muted">下次续约时设备将从地址池重新动态获取 IP。</p>
              </>
            }
            confirmLabel="确认删除"
            danger
            onClose={() => setDeleteLease(null)}
            onConfirm={async () => {
              const ok = await doDelete(lease());
              if (ok) setDeleteLease(null);
              return ok;
            }}
          />
        )}
      </Show>
    </div>
  );
}
