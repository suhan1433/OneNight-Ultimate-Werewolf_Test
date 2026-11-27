import { useEffect } from "react";
// Dynamic browser chrome and the on-screen keyboard must not push controls away.
export function useViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    function update() {
      if (viewport && viewport.scale !== 1) return;
      document.documentElement.style.setProperty(
        "--app-height",
        `${Math.round(viewport?.height || innerHeight)}px`,
      );
      const editing = document.activeElement instanceof HTMLInputElement;
      document.documentElement.dataset.keyboard = String(
        editing && (viewport?.height || innerHeight) < innerHeight * 0.75,
      );
    }
    update();
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      document.documentElement.style.removeProperty("--app-height");
      delete document.documentElement.dataset.keyboard;
    };
  }, []);
}
