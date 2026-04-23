"""从开题报告 .docx 提取纯文本，便于对照实现功能。

用法：
  1) 将「2134110467阮中一开题报告.docx」复制到项目根目录 `code/` 下
  2) 在项目根目录执行：npm run extract-report
  或指定文件：
     python tools/extract_docx_text.py ".\2134110467阮中一开题报告.docx"
输出：`_开题报告_extracted.txt`（UTF-8）
"""
from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET


def docx_to_text(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        xml_bytes = z.read("word/document.xml")
    root = ET.fromstring(xml_bytes)
    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    chunks: list[str] = []
    for t in root.iter(f"{{{ns}}}t"):
        if t.text:
            chunks.append(t.text)
        if t.tail:
            chunks.append(t.tail)
    text = "".join(chunks)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def find_default_docx(root: Path) -> Path | None:
    if not root.exists():
        return None
    for p in root.glob("*.docx"):
        n = p.name
        if "2134110467" in n or "开题" in n:
            return p
    return None


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    out = root / "_开题报告_extracted.txt"

    target: Path | None = None
    if len(sys.argv) >= 2:
        target = Path(sys.argv[1]).expanduser().resolve()
        if not target.is_file():
            out.write_text(f"FILE_NOT_FOUND: {target}\n", encoding="utf-8")
            return 1
    else:
        target = find_default_docx(root)
        if target is None:
            out.write_text(
                "NO_DOCX_FOUND\n\n"
                "请将「2134110467阮中一开题报告.docx」放到项目根目录，或执行：\n"
                '  python tools/extract_docx_text.py "你的文件.docx"\n',
                encoding="utf-8",
            )
            return 1

    text = docx_to_text(target)
    out.write_text(f"FILE={target}\n\n{text}\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
