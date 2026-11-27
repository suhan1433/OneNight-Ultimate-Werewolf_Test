export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // LAN HTTP browsers may not expose the modern clipboard API.
    const previous = document.activeElement as HTMLElement | null;
    const buffer = document.createElement("textarea");
    buffer.value = text;
    buffer.readOnly = true;
    buffer.setAttribute("aria-hidden", "true");
    Object.assign(buffer.style, {
      position: "fixed",
      left: "-9999px",
      top: "0",
      fontSize: "16px",
    });
    document.body.append(buffer);
    buffer.select();
    try {
      if (!document.execCommand("copy")) throw Error("복사할 수 없습니다.");
    } finally {
      buffer.remove();
      previous?.focus({ preventScroll: true });
    }
  }
}
