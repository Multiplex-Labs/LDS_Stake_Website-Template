import io
from typing import List

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Preformatted
from reportlab.lib.units import inch


def _markdown_to_flowables(markdown_text: str) -> List:
    """Very small markdown -> ReportLab flowables converter.

    Supports headings (#..), paragraphs, bulleted lists (- or *), and fenced
    code blocks (```).
    """
    styles = getSampleStyleSheet()
    normal = styles["Normal"]
    h1 = ParagraphStyle("Heading1", parent=styles["Heading1"], spaceAfter=6)
    h2 = ParagraphStyle("Heading2", parent=styles["Heading2"], spaceAfter=4)
    code_style = ParagraphStyle("Code", fontName="Courier", fontSize=8, leading=10)

    flowables = []
    lines = markdown_text.splitlines()
    in_code = False
    code_lines: List[str] = []

    for line in lines:
        if line.strip().startswith("```"):
            if in_code:
                # close code block
                flowables.append(Preformatted("\n".join(code_lines), code_style))
                flowables.append(Spacer(1, 6))
                code_lines = []
                in_code = False
            else:
                in_code = True
            continue

        if in_code:
            code_lines.append(line)
            continue

        stripped = line.strip()
        if not stripped:
            flowables.append(Spacer(1, 6))
            continue

        # Headings
        if stripped.startswith("# "):
            flowables.append(Paragraph(stripped[2:].strip(), h1))
            continue
        if stripped.startswith("## "):
            flowables.append(Paragraph(stripped[3:].strip(), h2))
            continue

        # Lists (simple)
        if stripped.startswith("- ") or stripped.startswith("* "):
            text = stripped[2:].strip()
            flowables.append(Paragraph(f"• {text}", normal))
            continue

        # Inline code/backticks -> render as monospaced
        if "`" in stripped:
            # naive: replace `code` with <font face="Courier">code</font>
            parts = []
            i = 0
            while i < len(stripped):
                if stripped[i] == "`":
                    j = stripped.find("`", i + 1)
                    if j == -1:
                        parts.append(stripped[i:])
                        break
                    code = stripped[i+1:j]
                    parts.append(f"<font face='Courier'>{code}</font>")
                    i = j + 1
                else:
                    parts.append(stripped[i])
                    i += 1
            flowables.append(Paragraph("".join(parts), normal))
            continue

        # Default paragraph
        flowables.append(Paragraph(stripped, normal))

    # if file ends while in code block
    if in_code and code_lines:
        flowables.append(Preformatted("\n".join(code_lines), code_style))

    return flowables


def convert_markdown_to_pdf(markdown_text: str) -> bytes:
    """Convert markdown text to PDF using ReportLab (pure-Python).

    This avoids requiring a pandoc executable. The converter supports a small
    subset of Markdown suitable for backups (headings, lists, code blocks).
    """
    try:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter,
                                rightMargin=72, leftMargin=72,
                                topMargin=72, bottomMargin=72)
        flowables = _markdown_to_flowables(markdown_text)
        doc.build(flowables)
        return buffer.getvalue()
    except Exception as e:
        raise RuntimeError(f"Failed to convert markdown to PDF: {e}")