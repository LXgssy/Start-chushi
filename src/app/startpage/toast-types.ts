import type { useToast } from "@/hooks/use-toast";

/** useToast().toast 的类型别名（跨 hook 模块传递用） */
export type ToastFn = ReturnType<typeof useToast>["toast"];
