import React from "react";
import { Button, Flex, TextField, Text } from "@radix-ui/themes";
import { X } from "lucide-react";
import { getRegionCode, getRegionDisplayName, getSupportedRegions, isRegionMatch } from "@/utils/regionHelper";

export default function ClassificationPicker({ value, onChange, options = [], country = false }: {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  country?: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);
  const candidates = country ? getSupportedRegions() : options;
  const visible = candidates.filter((item) => country
    ? isRegionMatch(item, search) || getRegionCode(item).toLowerCase().includes(search.toLowerCase())
    : item.toLowerCase().includes(search.trim().toLowerCase()));
  const select = (item: string) => { onChange(item); setSearch(""); setExpanded(false); };
  return (
    <div className="rounded-md border border-gray-6 p-2">
      <Flex align="center" gap="2" wrap="wrap">
        {value && <Button type="button" variant="soft" color="gray" onClick={() => onChange("")} title="移除此节点的分类">
          {country ? `${getRegionDisplayName(value)} ${getRegionCode(value)}` : value}<X size={14} />
        </Button>}
        <TextField.Root
          aria-label={country ? "搜索国家/地区" : "搜索或创建分组"}
          placeholder={country ? "搜索国家名称、代码，如日本 / JP" : "搜索或输入新分组"}
          value={search}
          className="min-w-40 flex-1"
          onFocus={() => setExpanded(true)}
          onChange={(event) => { setSearch(event.target.value); setExpanded(true); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setExpanded(false);
            if (event.key === "Enter" && !event.nativeEvent.isComposing && !country && search.trim()) {
              event.preventDefault(); select(search.trim());
            }
          }}
        />
      </Flex>
      {expanded && <Flex direction="column" gap="1" mt="2" style={{ maxHeight: 160, overflowY: "auto" }}>
        {!country && search.trim() && !options.includes(search.trim()) && <Button type="button" variant="soft" onClick={() => select(search.trim())}>创建“{search.trim()}”</Button>}
        {visible.map((item) => <Button key={item} type="button" variant={item === value ? "solid" : "ghost"} onClick={() => select(item)} style={{ justifyContent: "flex-start", flexShrink: 0 }}>
          {country ? `${item} ${getRegionDisplayName(item)} · ${getRegionCode(item)}` : item}
        </Button>)}
        {country && visible.length === 0 && <Text size="2" color="gray">未找到国家/地区</Text>}
      </Flex>}
    </div>
  );
}
