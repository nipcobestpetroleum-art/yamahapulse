import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props { page: number; pageSize: number; total: number; onPageChange: (page: number) => void; }

export function TablePagination({ page, pageSize, total, onPageChange }: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground"><span>Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" className="h-8" onClick={() => onPageChange(page - 1)} disabled={page === 1}><ChevronLeft className="mr-1 h-3.5 w-3.5" />Previous</Button><span className="min-w-16 text-center">Page {page} of {pageCount}</span><Button variant="outline" size="sm" className="h-8" onClick={() => onPageChange(page + 1)} disabled={page === pageCount}>Next<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></div></div>;
}
