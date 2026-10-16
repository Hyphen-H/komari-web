import React from "react";
import { Badge, Button, Dialog, Flex, IconButton, SegmentedControl, Text, TextField } from "@radix-ui/themes";
import { Check, Pencil, Tags, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import Flag from "@/components/Flag";
import { SelectOrInput } from "@/components/ui/select-or-input";
import type { NodeDetail } from "@/contexts/NodeDetailsContext";
import { getRegionDisplayName } from "@/utils/regionHelper";
import ClassificationPicker from "./ClassificationPicker";
import "./classification.css";
import TagEditor, { parseEditableTag } from "./TagEditor";

type Kind = "tags" | "group" | "region";

type ClassificationItem = {
  value: string;
  nodes: NodeDetail[];
};

function splitTags(value: unknown): string[] {
  return String(value || "").split(";").map((item) => item.trim()).filter(Boolean);
}

function collectItems(nodes: NodeDetail[], kind: Kind): ClassificationItem[] {
  const usage = new Map<string, NodeDetail[]>();
  for (const node of nodes) {
    const values = kind === "tags" ? splitTags(node.tags) : [String(node[kind] || "").trim()].filter(Boolean);
    for (const value of new Set(values)) usage.set(value, [...(usage.get(value) || []), node]);
  }
  return [...usage].map(([value, itemNodes]) => ({ value, nodes: itemNodes }))
    .sort((left, right) => left.value.localeCompare(right.value, "zh-CN"));
}

function replaceClassification(node: NodeDetail, kind: Kind, from: string, to: string): Record<string, string> {
  if (kind === "tags") {
    const next = splitTags(node.tags).map((tag) => tag === from ? to : tag).filter(Boolean);
    return { uuid: node.uuid, tags: [...new Set(next)].join(";"), expected_tags: String(node.tags || "") };
  }
  return { uuid: node.uuid, [kind]: to, [`expected_${kind}`]: String(node[kind] || ""), ...(kind === "region" ? { expected_region_manual: String(Boolean(node.region_manual)) } : {}) };
}

export default function ClassificationManager({ nodes, onSaved }: { nodes: NodeDetail[]; onSaved: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<Kind>("tags");
  const [editing, setEditing] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [assignValue, setAssignValue] = React.useState("");
  const [selectedNodes, setSelectedNodes] = React.useState<string[]>([]);
  const items = React.useMemo(() => collectItems(nodes, kind), [kind, nodes]);

  const apply = async (item: ClassificationItem, next: string) => {
    const normalized = next.trim();
    if (normalized === item.value) {
      setEditing("");
      return;
    }
    const action = normalized ? `将“${item.value}”修改/合并为“${normalized}”` : `删除“${item.value}”`;
    if (!window.confirm(`${action}？将影响 ${item.nodes.length} 个节点。`)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/client/classifications/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: item.nodes.map((node) => replaceClassification(node, kind, item.value, normalized)) }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast.success("分类已更新");
      setEditing("");
      onSaved();
    } catch (error) {
      console.error(error);
      toast.error("分类更新未完成，请刷新确认最新数据后重试");
    } finally {
      setSaving(false);
    }
  };

  const removeNode = async (item: ClassificationItem, node: NodeDetail) => {
    if (saving || !window.confirm(`仅从节点“${node.name}”移除“${item.value}”？其他节点不受影响。`)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/client/classifications/edit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [replaceClassification(node, kind, item.value, "")] }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast.success("已从节点移除分类");
      onSaved();
    } catch {
      toast.error("移除未完成，请刷新确认最新数据后重试");
    } finally { setSaving(false); }
  };

  const assign = async () => {
    const value = assignValue.trim();
    if (!value || selectedNodes.length === 0) return;
    const targetNodes = nodes.filter((node) => selectedNodes.includes(node.uuid));
    setSaving(true);
    try {
      const updates = targetNodes.map((node) => {
        if (kind === "tags") {
          return { uuid: node.uuid, tags: [...new Set([...splitTags(node.tags), value])].join(";"), expected_tags: String(node.tags || "") };
        }
        return { uuid: node.uuid, [kind]: value, [`expected_${kind}`]: String(node[kind] || ""), ...(kind === "region" ? { expected_region_manual: String(Boolean(node.region_manual)) } : {}) };
      });
      const response = await fetch("/api/admin/client/classifications/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast.success(`已分配给 ${targetNodes.length} 个节点`);
      setAssignValue("");
      setSelectedNodes([]);
      onSaved();
    } catch (error) {
      console.error(error);
      toast.error("分类分配未完成，请刷新确认最新数据后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger><Button variant="soft"><Tags size={16} />分类管理</Button></Dialog.Trigger>
      <Dialog.Content className="km-classification-dialog" style={{ maxWidth: 760 }}>
        <Dialog.Title>分类管理</Dialog.Title>
        <Dialog.Description>集中浏览、改名、合并或删除分类；修改会一次性应用到所有关联节点。</Dialog.Description>
        <SegmentedControl.Root disabled={saving} value={kind} onValueChange={(value) => { setKind(value as Kind); setEditing(""); setAssignValue(""); }} mt="3">
          <SegmentedControl.Item value="tags">标签</SegmentedControl.Item>
          <SegmentedControl.Item value="group">分组</SegmentedControl.Item>
          <SegmentedControl.Item value="region">国家/地区</SegmentedControl.Item>
        </SegmentedControl.Root>
        <div className="mt-4 rounded-md border border-gray-6 bg-gray-2 p-3">
          <Text weight="bold">新建或分配{kind === "tags" ? "标签" : kind === "group" ? "分组" : "国家/地区"}</Text>
          <Flex gap="2" mt="2" direction={{ initial: "column", sm: "row" }}>
            {kind === "region" ? (
              <ClassificationPicker country value={assignValue} onChange={setAssignValue} />
            ) : (
              <SelectOrInput
                options={items.map((item) => item.value)}
                value={assignValue}
                onChange={setAssignValue}
                className="flex-1"
                placeholder="选择已有项或输入新名称"
              />
            )}
            <Button disabled={saving || !assignValue.trim() || selectedNodes.length === 0} onClick={assign}>
              分配给 {selectedNodes.length} 个节点
            </Button>
          </Flex>
          <Flex gap="1" wrap="wrap" mt="2">
            {nodes.map((node) => {
              const selected = selectedNodes.includes(node.uuid);
              return (
                <Badge
                  key={node.uuid}
                  variant={selected ? "solid" : "outline"}
                  color={selected ? undefined : "gray"}
                  className="cursor-pointer select-none"
                  onClick={() => setSelectedNodes((current) => selected ? current.filter((uuid) => uuid !== node.uuid) : [...current, node.uuid])}
                >
                  {node.name}
                </Badge>
              );
            })}
          </Flex>
        </div>
        <Flex direction="column" gap="2" mt="4" className="km-classification-items">
          {items.length === 0 && <Text color="gray">暂无已使用的分类</Text>}
          {items.map((item) => (
            <Flex key={item.value} justify="between" align="center" gap="3" className="rounded-md border border-gray-6 p-3">
              <Flex direction="column" gap="1" style={{ minWidth: 0, flex: 1 }}>
                {editing === item.value ? (
                  kind === "region" ? (
                    <ClassificationPicker country value={draft} onChange={setDraft} />
                  ) : kind === "tags" ? (
                    <TagEditor value={draft} onChange={setDraft} />
                  ) : (
                    <TextField.Root value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
                  )
                ) : (
                  <Flex align="center" gap="2" wrap="wrap">
                    {kind === "region" && <Flag flag={item.value} />}
                    {kind === "tags" ? <Badge size="2" color={parseEditableTag(item.value).color}>{parseEditableTag(item.value).text}</Badge> : <Text weight="bold">{kind === "region" ? `${getRegionDisplayName(item.value)} (${item.value})` : item.value}</Text>}
                    <Badge color="gray" variant="soft">{item.nodes.length} 个节点</Badge>
                  </Flex>
                )}
                <details>
                  <summary className="text-xs cursor-pointer text-gray-11">查看关联节点 · {item.nodes.length} 台</summary>
                  <Flex gap="1" wrap="wrap" mt="2">
                    {item.nodes.map((node) => <Button key={node.uuid} size="1" variant="soft" color="gray" disabled={saving} onClick={() => removeNode(item, node)} aria-label={`从 ${node.name} 移除 ${item.value}`}>
                      {node.name}<X size={12} />
                    </Button>)}
                  </Flex>
                </details>
              </Flex>
              <Flex gap="1">
                {editing === item.value ? (
                  <>
                    <IconButton disabled={saving || !draft.trim()} onClick={() => apply(item, draft)}><Check size={16} /></IconButton>
                    <IconButton variant="soft" color="gray" onClick={() => setEditing("")}><X size={16} /></IconButton>
                  </>
                ) : (
                  <>
                    <IconButton variant="soft" onClick={() => { setEditing(item.value); setDraft(item.value); }} title="修改或合并"><Pencil size={16} /></IconButton>
                    <IconButton variant="soft" color="red" disabled={saving} onClick={() => apply(item, "")} title="删除"><Trash2 size={16} /></IconButton>
                  </>
                )}
              </Flex>
            </Flex>
          ))}
        </Flex>
        <Flex justify="end" mt="4"><Dialog.Close><Button variant="soft" color="gray">关闭</Button></Dialog.Close></Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
