import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Modal, ModalHeader } from "./Modal";

describe("Modal", () => {
  it("names the dialog by its header's title", () => {
    const html = renderToStaticMarkup(
      <Modal open labelledBy="t" onClose={() => {}}>
        <ModalHeader id="t" kicker="Latest news">
          Ana Lima
        </ModalHeader>
      </Modal>,
    );
    expect(html).toMatch(/^<dialog [^>]*aria-labelledby="t"/);
    expect(html).toMatch(/<h2 id="t"[^>]*><span[^>]*>Latest news<\/span>Ana Lima<\/h2>/);
    expect(html).toContain('aria-label="Close"');
  });

  it("renders nothing inside while closed", () => {
    const html = renderToStaticMarkup(
      <Modal open={false} labelledBy="t" onClose={() => {}}>
        <p>hidden</p>
      </Modal>,
    );
    expect(html).not.toContain("hidden");
  });
});
