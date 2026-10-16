import { Flex, Select, TextField } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";

export const tagColors = ["gray", "gold", "bronze", "brown", "yellow", "amber", "orange", "tomato", "red", "ruby", "crimson", "pink", "plum", "purple", "violet", "iris", "indigo", "blue", "cyan", "teal", "jade", "green", "grass", "lime", "mint", "sky"] as const;
export type TagColor = typeof tagColors[number];

export function parseEditableTag(value: string): { text: string; color?: TagColor } {
  const match = value.match(/^(.*?)<([a-z]+)>$/i);
  if (match && tagColors.includes(match[2].toLowerCase() as TagColor)) {
    return { text: match[1], color: match[2].toLowerCase() as TagColor };
  }
  return { text: value };
}

export default function TagEditor({ value, onChange, label = "标签名称" }: { value: string; onChange: (value: string) => void; label?: string }) {
  const { t } = useTranslation();
  const tag = parseEditableTag(value);
  const update = (text: string, color?: TagColor) => onChange(`${text}${color ? `<${color}>` : ""}`);
  return <Flex gap="2" wrap="wrap" style={{ minWidth: 0, flex: 1 }}>
    <TextField.Root aria-label={label} value={tag.text} className="min-w-32 flex-1" placeholder="标签名称" onChange={(event) => update(event.target.value, tag.color)} />
    <Select.Root value={tag.color || "default"} onValueChange={(color) => update(tag.text, color === "default" ? undefined : color as TagColor)}>
      <Select.Trigger aria-label="标签颜色" />
      <Select.Content>
        <Select.Item value="default">默认颜色</Select.Item>
        {tagColors.map((color) => <Select.Item key={color} value={color}><span style={{ color: `var(--${color}-11)` }}>●</span> {t(`color.${color}`, color)}</Select.Item>)}
      </Select.Content>
    </Select.Root>
  </Flex>;
}
