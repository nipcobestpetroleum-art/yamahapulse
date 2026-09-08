import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { timestampSlug } from "@/lib/export";

export interface PdfTableOptions {
  title: string;
  subtitle?: string;
  orgName?: string;
  filename: string;
  head: string[];
  body: (string | number | boolean | null | undefined)[][];
}

const NAVY: [number, number, number] = [14, 26, 51];
const HEAD_FILL: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];

/**
 * Generates a branded YamahaPulse PDF report with a header band, zebra-striped
 * table and a footer with page numbers.
 */
export function downloadPdfTable({
  title,
  subtitle,
  orgName,
  filename,
  head,
  body,
}: PdfTableOptions): void {
  const doc = new jsPDF({
    orientation: head.length > 6 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("YamahaPulse", 14, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  if (orgName) doc.text(orgName, 14, 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(title, pageWidth - 14, 11, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated ${new Date().toLocaleString()}`, pageWidth - 14, 18, { align: "right" });

  // Subtitle below the band
  let startY = 32;
  if (subtitle) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(10);
    doc.text(subtitle, 14, startY);
    startY += 4;
  }

  autoTable(doc, {
    head: [head],
    body: body.map((row) => row.map((cell) => (cell === null || cell === undefined ? "—" : String(cell)))),
    startY,
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 2.2, textColor: [51, 65, 85] },
    headStyles: { fillColor: HEAD_FILL, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("YamahaPulse — automated fleet reporting", 14, pageHeight - 7);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: "right" });
  }

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}-${timestampSlug()}.pdf`);
}
