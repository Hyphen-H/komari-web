import { useEffect, useState } from "react";
import { Button, Flex, SegmentedControl, Text, TextField } from "@radix-ui/themes";
import { toast } from "sonner";

type Config = {
  revision: string; managed: boolean; day: number;
  applied_revision: string; effective_day: number; effective_managed: boolean;
  error: string; seen_at: string | null;
};

const describeDay = (day: number) => day === 0 ? "禁用月周期统计" : `每月 ${day} 日`;

export default function AgentTrafficSettings({ uuid }: { uuid: string }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [mode, setMode] = useState("local");
  const [day, setDay] = useState("1");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/admin/client/${uuid}/traffic-config`);
        if (!response.ok) throw new Error();
        const next: Config = await response.json();
        if (!cancelled) { setConfig(next); setLoadError(""); }
      } catch { if (!cancelled) setLoadError("无法读取流量配置，请检查主控版本或登录状态"); }
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [uuid]);
  useEffect(() => {
    if (config && !dirty) {
      setMode(config.managed ? "managed" : "local");
      setDay(String(config.day || 0));
    }
  }, [config, dirty]);
  const save = async () => {
    const value = Number(day);
    if (mode === "managed" && (!day.trim() || !Number.isInteger(value) || value < 0 || value > 31)) {
      toast.error("请输入 0～31 的整数，0 表示禁用"); return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/client/${uuid}/traffic-config`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managed: mode === "managed", day: mode === "managed" ? value : 0 }),
      });
      if (!response.ok) throw new Error();
      setConfig(await response.json()); setDirty(false);
      toast.success("主控设置已保存，等待 Agent 确认生效");
    } catch { toast.error("流量配置保存失败"); } finally { setSaving(false); }
  };
  const confirmed = config && config.revision && config.revision === config.applied_revision
    && config.effective_managed === config.managed && (!config.managed || config.effective_day === config.day);
  const recent = config?.seen_at && Date.now() - Date.parse(config.seen_at) < 60000;
  const status = !config?.seen_at ? "尚未检测到远程流量配置能力：Agent 离线或需要升级"
    : config.error ? "同步失败：Agent 未能保存或应用配置，将自动重试"
      : !recent ? "Agent 暂未回报，等待重连；以下为上次确认值"
        : !config.revision ? "沿用本地配置（尚未接管）"
          : confirmed ? "已生效（Agent 已确认）" : "待同步（尚未收到对应版本确认）";
  return <section className="rounded-md border border-gray-6 p-3">
    <Flex direction="column" gap="3">
      <Text weight="bold">每月流量重置日 · Agent 配置</Text>
      <Text size="2" color="gray">{loadError || status}</Text>
      {config?.revision && <Text size="2">主控已保存目标：{config.managed ? describeDay(config.day) : "恢复被控本地配置"}</Text>}
      {config?.seen_at && <Text size="2">Agent 实际值：{describeDay(config.effective_day)} · {config.effective_managed ? "主控管理" : "本地配置"}（{new Date(config.seen_at).toLocaleString()}）</Text>}
      <Flex gap="2" align="center" wrap="wrap">
        <SegmentedControl.Root aria-label="流量重置配置来源" value={mode} onValueChange={(value) => { setMode(value); setDirty(true); }} disabled={!config || saving}>
          <SegmentedControl.Item value="local">本地配置</SegmentedControl.Item>
          <SegmentedControl.Item value="managed">主控管理</SegmentedControl.Item>
        </SegmentedControl.Root>
        {mode === "managed" && <TextField.Root aria-label="每月流量重置日" type="number" min="0" max="31" step="1" value={day} onChange={(event) => { setDay(event.target.value); setDirty(true); }} style={{ width: 100 }} />}
        <Button type="button" disabled={!config || saving} onClick={save}>{saving ? "保存中…" : "保存并同步重置日"}</Button>
      </Flex>
      <Text size="1" color="gray">此按钮单独保存并同步，不受节点编辑底部“保存”控制。被控需升级到支持远程配置的 Agent；离线重连后同步。0 表示禁用，1～31 为重置日，按被控本地时区；当月无对应日期顺延至下月 1 日。不清空历史，缺失数据无法补齐。</Text>
    </Flex>
  </section>;
}
