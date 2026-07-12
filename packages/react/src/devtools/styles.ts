/**
 * Shipped as a <style> element inside the panel rather than a CSS file: no
 * import for consumers to wire up, no document.head mutation, and it renders
 * fine on the server. Every rule is scoped under .ue-ins.
 */
export const STYLES = `
.ue-ins {
  position: fixed;
  z-index: 2147483000;
  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #e6edf3;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgb(0 0 0 / 0.4);
  max-width: min(420px, calc(100vw - 24px));
  overflow: hidden;
}
.ue-ins--bottom-right { bottom: 12px; right: 12px; }
.ue-ins--bottom-left  { bottom: 12px; left: 12px; }
.ue-ins--top-right    { top: 12px; right: 12px; }
.ue-ins--top-left     { top: 12px; left: 12px; }

.ue-ins__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  background: #161b22;
  border: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.ue-ins__dot { width: 7px; height: 7px; border-radius: 50%; background: #3fb950; flex: none; }
.ue-ins__title { font-weight: 600; }
.ue-ins__muted { color: #8b949e; }
.ue-ins__crown { margin-left: auto; color: #d29922; }

.ue-ins__body { max-height: 60vh; overflow-y: auto; }
.ue-ins__section { border-top: 1px solid #21262d; padding: 8px 10px; }
.ue-ins__h {
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
  margin-bottom: 5px;
}
.ue-ins__row { display: flex; gap: 8px; padding: 1px 0; }
.ue-ins__k { color: #79c0ff; flex: none; }
.ue-ins__v { color: #e6edf3; overflow-wrap: anywhere; }
.ue-ins__ver { color: #6e7681; margin-left: auto; flex: none; }
.ue-ins__empty { color: #6e7681; }

.ue-ins__log { display: flex; flex-direction: column-reverse; max-height: 190px; overflow-y: auto; }
.ue-ins__wire { display: flex; gap: 7px; padding: 1px 0; white-space: nowrap; }
.ue-ins__dir { flex: none; width: 9px; }
.ue-ins__dir--out { color: #d29922; }
.ue-ins__dir--in { color: #3fb950; }
.ue-ins__scope { color: #e6edf3; }
.ue-ins__from { color: #6e7681; margin-left: auto; }
`;
