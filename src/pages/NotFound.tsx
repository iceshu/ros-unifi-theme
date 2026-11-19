import { EmptyState } from "../components/ui";

export function NotFoundPage() {
  return (
    <EmptyState title="没有这个页面" detail="从左侧回到概览。仪表只提供查看，没有隐藏的管理入口。" />
  );
}
