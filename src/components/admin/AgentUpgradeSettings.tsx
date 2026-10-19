import { useEffect, useState } from "react";
import { Button, Flex, Text, TextField } from "@radix-ui/themes";
import { toast } from "sonner";

type Status = { version: string; online: boolean; traffic_supported: boolean; managed_version: string; repository: string };
export default function AgentUpgradeSettings({ uuid, version, onUpdated }: { uuid: string; version: string; onUpdated: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("latest");
  const [otp, setOtp] = useState("");
  const [taskId, setTaskId] = useState("");
  const [started, setStarted] = useState(0);
  const [kind, setKind] = useState<"managed" | "version">("managed");
  const [taskFailed, setTaskFailed] = useState(false);
  const upgradePending = Boolean(started && Date.now() - started < 180000 && !taskFailed && !(kind === "managed" && status?.version === status?.managed_version && status?.traffic_supported));
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/admin/client/${uuid}/upgrade-status`);
        if (!response.ok) throw new Error();
        const next: Status = await response.json();
        if (!cancelled) {
          setStatus(next);
          if (started && next.online && ((kind === "managed" && next.version === next.managed_version && next.traffic_supported) || (kind === "version" && target !== "latest" && !target.includes("*") && next.version.replace(/^v/, "") === target.replace(/^v/, "")))) {
            setMessage("已确认：Agent 版本已上报" + (kind === "managed" ? "，流量同步能力已生效" : ""));
          } else if (started && Date.now() - started > 180000 && !taskFailed) {
            setMessage("尚未确认升级结果，请检查任务输出和 Agent 日志；不会自动重发升级命令");
          }
        }
      } catch { if (!cancelled && !started) setMessage("无法读取 Agent 状态，请检查主控版本或登录状态"); }
      if (taskId) {
        try {
          const response = await fetch(`/api/admin/task/${taskId}`);
          const body = await response.json(); const task = body.data ?? body;
          const result = task.results?.find((item: { client: string }) => item.client === uuid);
          if (!cancelled && result?.exit_code != null && result.exit_code !== 0) {
            setTaskFailed(true); setMessage(`升级命令失败：${String(result.result || "请查看远程任务日志").slice(0, 600)}`);
          }
        } catch { /* A task query is not proof of installation. */ }
      }
    };
    void refresh(); const timer = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [uuid, taskId, started, kind, target, taskFailed]);
  const send = async (mode: "managed" | "version") => {
    const text = mode === "managed"
      ? "仅升级此节点到 Hyphen-H/komari-agent 固定校验版本。将保留身份、参数和历史；未来版本切换来源为你的 fork（现有禁用自动更新选项保持不变）。仅支持 Linux amd64/arm64 + root systemd，确认发送？"
      : `向此节点发送版本切换 ${target}？版本来自 Agent 自身仓库；latest 不保证支持流量同步。`;
    if (!window.confirm(text)) return;
    setBusy(true); setMessage(""); setTaskFailed(false);
    try {
      const response = await fetch(`/api/admin/client/${uuid}/${mode === "managed" ? "upgrade-managed" : "switch-version"}`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(otp ? { "X-2FA-Code": otp } : {}) },
        body: JSON.stringify(mode === "managed" ? { confirm: true } : { version: target.trim() }),
      });
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(body.error?.message || body.error || body.message || `HTTP ${response.status}`);
      const data = body.data ?? body;
      setTaskId(data.task_id || ""); setKind(mode); setStarted(Date.now());
      setMessage("命令已发送，等待 Agent 下载、重启并回报；这不代表升级成功");
      setOtp(""); onUpdated(); toast.success("升级请求已发送");
    } catch (error) { setMessage(error instanceof Error ? error.message : "升级发送失败"); } finally { setBusy(false); }
  };
  return <Flex direction="column" gap="3">
    <Text weight="bold">Agent 远程升级</Text>
    <Text size="2">当前上报版本：{status?.version || version || "未知"} · {status?.online ? "在线" : "离线或尚未读取"}</Text>
    <Text size="2">流量同步能力：{status?.traffic_supported ? "已确认支持" : "未确认支持"}</Text>
    <Button type="button" disabled={busy || upgradePending || !status?.online} onClick={() => send("managed")}>升级到支持流量同步的 fork 版</Button>
    <Text size="1" color="gray">固定版本 {status?.managed_version || "dev-managed-traffic-db3c5e8"}，下载来自 Hyphen-H/komari-agent 并校验 SHA-256。仅替换二进制并备份，不重装、不重新注册；失败可查看远程任务。Docker、Windows、非 systemd 或关闭远程控制的节点不适用。</Text>
    <Flex gap="2" wrap="wrap">
      <TextField.Root aria-label="Agent 目标版本" placeholder="latest / 1.2.* / 精确版本" value={target} onChange={(event) => setTarget(event.target.value)} />
      <Button type="button" variant="soft" disabled={busy || upgradePending || !status?.online || !target.trim()} onClick={() => send("version")}>发送版本切换命令</Button>
    </Flex>
    <TextField.Root aria-label="升级操作二次验证码" placeholder="启用两步验证时填写验证码" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} />
    {message && <Text size="2" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message}</Text>}
    {taskId && <Text size="1" color="gray">任务 ID：{taskId}（可在远程执行中查看输出）</Text>}
  </Flex>;
}
