"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      {/* ⚠ pointer-events-none（v1.1.3 根治律）：viewport 是常驻 DOM 的右上角
          竖带（fixed top-0 right-0 z-[100] w-full md:max-w-[380px] max-h-screen），
          Radix 在「有 toast 显示期间」把 viewport 的 pointer-events 置回 auto
          （源码 style.pointerEvents = hasToasts ? undefined : "none"）——
          toast 弹出的数秒内这层 z-[100] 竖带会挡住 ⌘K 遮罩（z-50）右侧全部
          空白点击，「点空白关不掉面板、面板上晃一下鼠标才恢复」的实证根因。
          viewport 自身永不接收指针；toast 卡片本体已带 pointer-events-auto，
          hover 暂停 / 滑动关闭不受影响。 */}
      <ToastViewport className="pointer-events-none fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:top-0 sm:right-0 sm:flex-col md:max-w-[380px]" />
    </ToastProvider>
  )
}