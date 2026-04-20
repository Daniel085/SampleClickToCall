export function toast(message: string, kind: "info" | "error" = "info", ms = 4000): void {
  const root = getRoot();
  const node = document.createElement("div");
  node.className = `toast toast-${kind}`;
  node.textContent = message;
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add("toast-visible"));
  setTimeout(() => {
    node.classList.remove("toast-visible");
    setTimeout(() => node.remove(), 200);
  }, ms);
}

function getRoot(): HTMLElement {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.appendChild(root);
  }
  return root;
}
