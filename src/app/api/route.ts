import { NextResponse } from "next/server";

/* force-static：GitHub Pages 静态导出（EXPORT_MODE 构建）要求所有路由可静态化；
   本路由为脚手架示例（前端零调用），静态化对 standalone 生产构建无影响 */
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({ message: "Hello, world!" });
}