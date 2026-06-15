import pandoc

def convert_markdown_to_pdf(markdown_text: str) -> bytes:
    """Convert markdown text to PDF using pandoc."""
    try:
        doc = pandoc.read(markdown_text, format="markdown")
        pdf_bytes = doc.to_pdf()
        return pdf_bytes
    except Exception as e:
        raise RuntimeError(f"Failed to convert markdown to PDF: {e}")