"use client";

// Portal demo only: stands in for files in storage (lesson PDFs, uploads,
// certificates). Each "file" is made in the browser: a one-page PDF that says
// it is a demo file, a plain picture, or a short text file. Never a photo.

const cache = new Map<string, string>();

function pdf(title: string): Blob {
  const safe = title.replace(/[()\\]/g, "").slice(0, 70);
  const text = `BT /F1 20 Tf 60 760 Td (Portal demo file) Tj 0 -30 Td /F1 12 Tf (${safe}) Tj 0 -22 Td (This is a sample document made up for the demo.) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: "application/pdf" });
}

function picture(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#f4f1ea"/><rect x="40" y="40" width="560" height="320" rx="12" fill="none" stroke="#cfc8b8" stroke-width="2"/><text x="320" y="200" font-family="Inter, Arial, sans-serif" font-size="22" fill="#4a5a52" text-anchor="middle">Demo picture</text><text x="320" y="232" font-family="Inter, Arial, sans-serif" font-size="14" fill="#6b7a72" text-anchor="middle">${label.replace(/[<&>]/g, "").slice(0, 50)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function demoFile(path: string, bucket = ""): string {
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const name = path.split("/").pop() || "file";
  let url: string;
  if (/\.(png|jpe?g|webp|gif|svg|heic)$/i.test(name)) url = picture(name);
  else if (/\.(txt|csv|ics)$/i.test(name)) url = URL.createObjectURL(new Blob([`Portal demo file: ${name}\n`], { type: "text/plain" }));
  else url = URL.createObjectURL(pdf(name));
  cache.set(key, url);
  return url;
}
