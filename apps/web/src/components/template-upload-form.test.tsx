// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemplateUploadForm } from "./template-upload-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { size?: string }) => {
    const messages: Record<string, string> = {
      drop: "Drop a PDF here or choose a file",
      invalidPdf: "Only PDF files can be uploaded.",
      limits: "PDF limits",
      megabytes: `${values?.size ?? "0"} MB`,
      pdf: "Interactive PDF",
      upload: "Upload and map",
    };
    return messages[key] ?? key;
  },
}));

afterEach(cleanup);

describe("TemplateUploadForm", () => {
  it("accepts a PDF chosen through the file input", () => {
    render(<TemplateUploadForm />);
    const input = screen.getByLabelText("Interactive PDF");
    const file = new File(["pdf"], "character-sheet.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("character-sheet.pdf")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload and map" }),
    ).toBeEnabled();
  });

  it("accepts a PDF dropped on the upload area", () => {
    render(<TemplateUploadForm />);
    const dropZone = screen
      .getByText("Drop a PDF here or choose a file")
      .closest("label");
    const file = new File(["pdf"], "dropped-sheet.pdf", {
      type: "application/pdf",
    });

    expect(dropZone).not.toBeNull();
    fireEvent.drop(dropZone!, { dataTransfer: { files: [file] } });

    expect(screen.getByText("dropped-sheet.pdf")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload and map" }),
    ).toBeEnabled();
  });

  it("rejects a dropped non-PDF file", () => {
    render(<TemplateUploadForm />);
    const dropZone = screen
      .getByText("Drop a PDF here or choose a file")
      .closest("label");
    const file = new File(["text"], "notes.txt", { type: "text/plain" });

    fireEvent.drop(dropZone!, { dataTransfer: { files: [file] } });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Only PDF files can be uploaded.",
    );
    expect(
      screen.getByRole("button", { name: "Upload and map" }),
    ).toBeDisabled();
  });
});
