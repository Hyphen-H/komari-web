import { useEffect, useState } from "react";
import { Button, Dialog, Flex, Text, TextField } from "@radix-ui/themes";
import { toast } from "sonner";

type Status = { version: string; online: boolean; traffic_supported: boolean; managed_version: string; repository: string;
  upgrade_job?: { id: string; stage: string; created_at: string; updated_at: string };
  stage_label?: string; upgrade_events?: {stage:string;created_at:string}[]; task_output?: string; task_exit_code?: number;
};
const stageLabels: Record<string,string> = {
 queued:"主控已下发，等待目标机接收",received:"目标机已接收，检查环境",downloading:"下载固定版本中（最长180秒）",verified:"SHA-256校验通过",staged:"旧程序已备份，独立任务已就绪",restarting:"停止旧Agent、替换并重启",service_active:"systemd已启动，等待版本/能力回报",confirmed:"目标版本和流量同步能力已确认",failed:"升级失败，请查看输出",rolled_back:"升级失败，已尝试回滚旧程序",
};
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
  const [consoleOpen, setConsoleOpen] = useState(false);
  const persistedPending = status?.upgrade_job && !["confirmed","failed","rolled_back"].includes(status.upgrade_job.stage) && Date.now()-Date.parse(status.upgrade_job.created_at)<300000;
  const upgradePending = Boolean(persistedPending || (started && Date.now() - started < 180000 && !taskFailed && !(kind === "managed" && status?.upgrade_job?.stage === "confirmed")));
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/admin/client/${uuid}/upgrade-status`);
        if (!response.ok) throw new Error();
        const next: Status = await response.json();
        if (!cancelled) {
          setStatus(next);
          if (started && next.online && ((kind === "managed" && next.upgrade_job?.stage === "confirmed") || (kind === "version" && target !== "latest" && !target.includes("*") && next.version.replace(/^v/, "") === target.replace(/^v/, "")))) {
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
    void refresh(); const timer = setInterval(refresh, consoleOpen ? 1000 : 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [uuid, taskId, started, kind, target, taskFailed, consoleOpen]);
  const send = async (mode: "managed" | "version") => {
    const text = mode === "managed"
      ? "仅升级此节点到 Hyphen-H/komari-agent 固定校验版本。将保留身份、参数和历史；未来版本切换来源为你的 fork（现有禁用自动更新选项保持不变）。仅支持 Linux amd64/arm64 + root systemd，确认发送？"
      : `向此节点发送版本切换 ${target}？版本来自 Agent 自身仓库；latest 不保证支持流量同步。`;
    if (!window.confirm(text)) return;
    setBusy(true); setMessage("正在检查 Agent 能力并下发，请稍候…"); setTaskFailed(false); setConsoleOpen(true);
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
    <Button type="button" variant="soft" onClick={() => setConsoleOpen(true)}>打开升级控制台 / 查看最近进度</Button>
    <Text size="1" color="gray">固定版本 {status?.managed_version || "dev-managed-traffic-db3c5e8"}，下载来自 Hyphen-H/komari-agent 并校验 SHA-256。仅替换二进制并备份，不重装、不重新注册；失败可查看远程任务。Docker、Windows、非 systemd 或关闭远程控制的节点不适用。</Text>
    <Text size="1" color="gray">下面是高级选项：只在 Agent 自身仓库切换版本，不能把官方版切到 fork；相同版本可能不做任何操作。要启用同步请使用上方推荐按钮。</Text>
    <Flex gap="2" wrap="wrap">
      <TextField.Root aria-label="Agent 目标版本" placeholder="latest / 1.2.* / 精确版本" value={target} onChange={(event) => setTarget(event.target.value)} />
      <Button type="button" variant="soft" disabled={busy || upgradePending || !status?.online || !target.trim()} onClick={() => send("version")}>发送版本切换命令</Button>
    </Flex>
    <TextField.Root aria-label="升级操作二次验证码" placeholder="启用两步验证时填写验证码" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} />
    {message && <Text size="2" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message}</Text>}
    {taskId && <Text size="1" color="gray">任务 ID：{taskId}（可在远程执行中查看输出）</Text>}
    <Dialog.Root open={consoleOpen} onOpenChange={setConsoleOpen}>
      <Dialog.Content style={{maxWidth:760}} aria-describedby="upgrade-console-help">
        <Dialog.Title>Agent 升级控制台</Dialog.Title>
        <Dialog.Description id="upgrade-console-help">只读实时进度，每秒刷新；关闭窗口不会取消升级。不开放任意终端输入。</Dialog.Description>
        <Flex direction="column" gap="2" mt="3">
          <Text size="2">当前版本：{status?.version || version || "未知"} · {status?.online ? "在线" : "等待重连"}</Text>
          <Text size="2">{status?.stage_label || (busy ? "正在读取远程能力…" : "暂无 fork 升级任务。普通版本切换不提供安装进度，请用推荐升级入口。")}</Text>
          <pre role="log" aria-live="polite" style={{background:"var(--gray-12)",color:"var(--gray-1)",padding:16,borderRadius:8,maxHeight:320,overflow:"auto",whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:12}}>
            {(status?.upgrade_events || []).map((event) => `[${new Date(event.created_at).toLocaleTimeString()}] ${stageLabels[event.stage] || event.stage}`).join("\n") || "[等待] 尚未收到目标机进度回报"}
            {status?.task_output ? `\n\n[命令输出，exit=${status.task_exit_code}]\n${status.task_output}` : ""}
            {message ? `\n\n[状态] ${message}` : ""}
          </pre>
          {status?.upgrade_job && <Text size="1" color="gray">任务：{status.upgrade_job.id} · 最近进度：{new Date(status.upgrade_job.updated_at).toLocaleString()}{Date.now()-Date.parse(status.upgrade_job.updated_at)>60000 ? " · 超过60秒无新回报，请勿反复点击升级" : ""}</Text>}
          <Text size="1" color="gray">服务启动并不等于升级成功；只有目标版本与近期流量同步回报都匹配时才显示确认。失败时保留备份，不自动重复发送。</Text>
          <Flex justify="end"><Dialog.Close><Button type="button" variant="soft">关闭控制台</Button></Dialog.Close></Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  </Flex>;
}
