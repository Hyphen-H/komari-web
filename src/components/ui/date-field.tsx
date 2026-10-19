import * as React from "react";
import { TextField } from "@radix-ui/themes";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeDateInput } from "@/utils/dateInput";

export interface DateFieldProps {
  /** 表单字段名，提交时通过 FormData 读取规范化后的值。 */
  name?: string;
  /** 当前值，`YYYY-MM-DD` 或空串。 */
  value: string;
  onChange: (value: string) => void;
  /** 输入框占位符，例如 `YYYYMMDD`。 */
  placeholder?: string;
  /** 无障碍名称，用来关联表单里的文字标签。 */
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  /** 渲染在输入框右侧的附加操作，例如“设置为长期”。 */
  side?: React.ReactNode;
}

/**
 * 到期日输入框：键盘友好，支持直接输入 `20261104`、`2026-11-04`、
 * `2026/11/4`、`2026年11月4日` 等写法，失去焦点或输入满 8 位数字时自动
 * 规范为 `YYYY-MM-DD`。左侧日历按钮保留原生日期选择器。
 */
export function DateField({
  name,
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
  className,
  side,
}: DateFieldProps) {
  const pickerRef = React.useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = React.useState(false);
  const text = value ?? "";
  const parsed = normalizeDateInput(text);

  const commitNormalized = React.useCallback(
    (raw: string) => {
      if (raw.trim() === "") {
        setInvalid(false);
        onChange("");
        return;
      }
      const normalized = normalizeDateInput(raw);
      setInvalid(normalized === null);
      if (normalized) onChange(normalized);
    },
    [onChange]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInvalid(false);
    // 输满 8 位纯数字时立即识别，键盘录入无需再确认
    if (/^\d{8}$/.test(raw.trim())) {
      commitNormalized(raw);
      return;
    }
    onChange(raw);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // 提交前先规范化，提交处理里也会再解析一次兜底
      commitNormalized(text);
    }
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    const withPicker = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof withPicker.showPicker === "function") {
      try {
        withPicker.showPicker();
        return;
      } catch {
        // 回退到原生点击
      }
    }
    el.focus();
    el.click();
  };

  return (
    <div className={cn("km-ui-date-field relative w-full min-w-0", className)}>
      <TextField.Root
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={handleChange}
        onBlur={() => commitNormalized(text)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        color={invalid ? "red" : undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
      >
        <TextField.Slot side="left">
          <CalendarDays size="16" className="text-muted-foreground" />
        </TextField.Slot>
        {side ? <TextField.Slot side="right">{side}</TextField.Slot> : null}
      </TextField.Root>
      {/* 透明的原生日期输入，点击左上角日历图标时打开系统日期选择器 */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={parsed ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onClick={openPicker}
        className="absolute left-0 top-0 h-full w-9 cursor-pointer opacity-0"
        style={{ padding: 0, border: 0 }}
      />
    </div>
  );
}

export default DateField;
