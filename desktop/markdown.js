// Model replies are Markdown, like Claude's. They are untrusted text, so the HTML is sanitized before it
// touches the page: no scripts, no event handlers, no iframes. Links open in the browser, not in the app.
window.renderMarkdown = (text) => {
  // No images or styles: a reply could otherwise load a remote image that leaks text in its URL, or restyle the app.
  const html = window.DOMPurify.sanitize(window.marked.parse(String(text ?? ""), { gfm: true, breaks: true }), {
    FORBID_TAGS: ["img", "style", "form", "input", "button"],
    FORBID_ATTR: ["style"],
  });
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const link of template.content.querySelectorAll("a[href]")) {
    link.target = "_blank";
    link.rel = "noreferrer noopener";
  }
  // Wide tables scroll sideways instead of stretching the reply.
  for (const table of template.content.querySelectorAll("table")) {
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    table.replaceWith(wrap);
    wrap.append(table);
  }
  const box = document.createElement("div");
  box.className = "md";
  box.append(template.content);
  return box;
};
