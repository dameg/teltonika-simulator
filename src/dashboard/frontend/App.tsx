import type { ReactElement } from "react";

const placeholderSections = [
  {
    title: "Device Registry",
    body: "Register IMEIs and per-device simulator settings here."
  },
  {
    title: "Run Overview",
    body: "Aggregate counts and runtime state will land in this panel."
  },
  {
    title: "Device Logs",
    body: "Connection lifecycle and simulator events will appear here."
  }
];

export function App(): ReactElement {
  return (
    <main
      style={{
        background:
          "radial-gradient(circle at top, #f8f0d8 0%, #efe4c2 40%, #e2d3a3 100%)",
        color: "#1f1a13",
        fontFamily: '"Iowan Old Style", "Palatino Linotype", serif',
        minHeight: "100vh",
        padding: "32px 20px"
      }}
    >
      <div style={{ margin: "0 auto", maxWidth: "980px" }}>
        <header style={{ marginBottom: "28px" }}>
          <p
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: "12px",
              letterSpacing: "0.18em",
              margin: 0,
              textTransform: "uppercase"
            }}
          >
            Dashboard Shell
          </p>
          <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", margin: "8px 0 12px" }}>
            Teltonika Device Control
          </h1>
          <p style={{ fontSize: "1.05rem", lineHeight: 1.6, margin: 0, maxWidth: "56ch" }}>
            Bootstrap view only. Device CRUD, simulator controls, and live logs stay out of
            this task, but the app shell is in place for them.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
          }}
        >
          {placeholderSections.map((section) => (
            <article
              key={section.title}
              style={{
                background: "rgba(255, 251, 239, 0.82)",
                border: "1px solid rgba(76, 60, 31, 0.18)",
                borderRadius: "20px",
                boxShadow: "0 18px 40px rgba(63, 47, 20, 0.12)",
                padding: "20px"
              }}
            >
              <h2 style={{ fontSize: "1.2rem", margin: "0 0 10px" }}>{section.title}</h2>
              <p style={{ lineHeight: 1.55, margin: 0 }}>{section.body}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
