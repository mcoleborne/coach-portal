import "server-only";
import PDFDocument from "pdfkit";

/**
 * A plain, readable PDF of a card's markdown document. Headings, paragraphs,
 * lists and tables (as aligned rows). Inline markup is reduced to its text.
 */
export async function markdownToPdf(title: string, markdown: string, footer: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 }, info: { Title: title } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  doc.font("Helvetica-Bold").fontSize(18).text(clean(title));
  doc.moveDown(0.3).font("Helvetica").fontSize(9).fillColor("#5c5c58").text(footer).fillColor("#1e1e1c");
  doc.moveDown(0.8);

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      doc.font("Helvetica").fontSize(10.5).text(clean(para.join(" ")), { lineGap: 2 });
      doc.moveDown(0.5);
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flush();
    } else if (heading) {
      flush();
      const size = [16, 14, 12, 11, 11, 11][heading[1].length - 1];
      doc.moveDown(0.3).font("Helvetica-Bold").fontSize(size).text(clean(heading[2]));
      doc.moveDown(0.3);
    } else if (/^\s*\|/.test(line)) {
      flush();
      if (/^[\s|:-]+$/.test(line)) continue;
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => clean(c.trim()));
      doc.font("Helvetica").fontSize(9.5).text(cells.join("   |   "), { lineGap: 1 });
    } else if (bullet) {
      flush();
      doc.font("Helvetica").fontSize(10.5).text(`•  ${clean(bullet[1])}`, { indent: 10, lineGap: 2 });
    } else if (numbered) {
      flush();
      doc.font("Helvetica").fontSize(10.5).text(`${numbered[1]}.  ${clean(numbered[2])}`, { indent: 10, lineGap: 2 });
    } else {
      para.push(line.trim());
    }
  }
  flush();
  doc.end();
  return done;
}

function clean(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ‘’“”•–]/g, "");
}
