import { useEffect, useState } from "react";
import { Button, Flex, Text, TextArea, TextField } from "@radix-ui/themes";
import { toast } from "sonner";

type Status = { version: string; online: boolean; traffic_supported: boolean };
type Replacement = { command: string; version: string; repository: string; release: string };

export default function AgentUpgradeSettings({ uuid, version }: { uuid: string; version: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [service, setService] = useState("komari-agent");
  const [replacement, setReplacement] = useState<Replacement | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/admin/client/${uuid}/upgrade-status`);
        if (!response.ok) return;
        const next: Status = await response.json();
        if (!cancelled) setStatus(next);
      } catch { /* Status failure must not make the command look executed. */ }
    };
    void refresh(); const timer = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [uuid]);

  useEffect(() => {
    let cancelled = false;
    setReplacement(null); setError(""); setFallback(false);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.@-]{0,127}$/.test(service.trim())) {
      setError("请输入有效的 systemd 服务名，仅支持字母、数字和 . _ @ -"); return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/client/${uuid}/replacement-command?service=${encodeURIComponent(service.trim())}`);
        if (!response.ok) throw new Error("无法生成更换命令，请检查登录状态或主控版本");
        const next: Replacement = await response.json();
        if (!next.command) throw new Error("主控未返回更换命令");
        if (!cancelled) setReplacement(next);
      } catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : "命令生成失败"); }
      finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [uuid, service]);

  const copy = async () => {
    if (!replacement) return;
    try { await navigator.clipboard.writeText(replacement.command); toast.success("更换命令已复制；请在目标机 SSH 终端执行，面板未发送任何升级任务"); }
    catch { setFallback(true); toast.warning("浏览器无法访问剪贴板，请在下方命令框全选复制"); }
  };

  return <Flex direction="column" gap="3">
    <Text weight="bold">通过 SSH 更换 Agent</Text>
    <Text size="2">当前上报版本：{status?.version || version || "未知"} · {status?.online ? "在线" : "离线或尚未读取"}</Text>
    <Text size="2">流量重置日同步：{status?.traffic_supported ? "已确认支持，可到“重置日同步”设置" : "尚未确认支持；在目标机执行下方更换命令后回到此处检查"}</Text>
    <Text size="2">无需输入版本号。固定更换为 {replacement?.version || "dev-managed-traffic-db3c5e8"}（Hyphen-H/komari-agent fork 版）。此页面只生成命令，不远程执行。</Text>
    <label>
      <Text as="div" size="2" mb="1">目标机 Agent 服务名</Text>
      <TextField.Root aria-label="目标机 Agent 服务名" value={service} onChange={(event) => setService(event.target.value)} placeholder="komari-agent" autoComplete="off" />
    </label>
    <Text size="1" color="gray">标准安装保持 komari-agent 即可；只有自定义服务名才需要修改。请在目标服务器而非主控服务器执行。</Text>
    {error && <Text size="2" color="red">{error}</Text>}
    <TextArea aria-label="SSH Agent 更换命令" readOnly value={replacement?.command || (loading ? "正在生成…" : "")} style={{ minHeight: fallback ? 260 : 180, fontFamily: "monospace", fontSize: 12 }} onFocus={(event) => event.currentTarget.select()} />
    <Button type="button" disabled={!replacement || loading} onClick={copy}>复制 SSH 更换命令</Button>
    <Text size="2">1. SSH 登录目标机。2. 粘贴完整命令执行，终端显示下载及 1～6 步进度。3. 返回此页，等待“已确认支持”，再修改流量重置日。</Text>
    <Text size="1" color="gray">适用 Linux amd64/arm64、运行中的持久化 systemd 服务，需 root 或 sudo。自动选架构并校验 SHA-256，先下载后停服务；保留节点身份、启动参数、重置日和流量历史，不重装、不重新注册。Docker、Alpine/OpenRC、Windows 不适用，命令会停止而不是猜测安装方式。</Text>
    <Text size="1" color="gray">失败会尝试恢复旧二进制，并打印备份目录。查看服务：systemctl status komari-agent；日志：journalctl -u komari-agent -n 50（自定义服务名需相应替换）。更换后版本来源为你的 fork，原有自动更新选项保持不变。</Text>
    {replacement && <a href={replacement.release} target="_blank" rel="noreferrer" className="text-sm underline">查看固定版本及校验文件</a>}
  </Flex>;
}
