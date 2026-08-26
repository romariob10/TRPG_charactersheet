import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import type { FrameNode, LayoutNode, TextNode } from "@mycharacter/contracts";
import { defaultBoxProps } from "@mycharacter/contracts";
import {
  canDropNode,
  duplicateNode,
  findNode,
  findNodeAndParent,
  getAncestorIds,
  insertNode,
  isDescendantOf,
  moveNode,
  removeNode,
  renameNode,
} from "./tree-utils";

function makeFrame(children: LayoutNode[] = [], name = "Frame"): FrameNode {
  return {
    id: crypto.randomUUID(),
    kind: "frame",
    name,
    direction: "vertical",
    gap: 8,
    align: "start",
    justify: "start",
    wrap: false,
    collapseAdjacentStrokes: false,
    cornerOrnaments: {
      preset: "none",
      topLeft: true,
      topRight: true,
      bottomRight: true,
      bottomLeft: true,
    },
    topOrnament: {
      preset: "none",
      align: "center",
      offset: 0,
      text: "",
      fontFamily: "Montserrat Alternates",
      fontSize: 10,
      fontWeight: "medium",
      letterSpacingPx: -0.9,
    },
    bottomOrnament: {
      preset: "none",
      align: "center",
      offset: 0,
      text: "",
      fontFamily: "Montserrat Alternates",
      fontSize: 10,
      fontWeight: "medium",
      letterSpacingPx: -0.9,
    },
    box: defaultBoxProps,
    children,
  };
}

function makeText(text: string, name = "Text"): TextNode {
  return {
    id: crypto.randomUUID(),
    kind: "text",
    name,
    text,
    variant: "body",
    align: "left",
    weight: "normal",
    fontFamily: "default",
    uppercase: false,
    color: "default",
    box: defaultBoxProps,
  };
}

describe("tree-utils", () => {
  it("finds nodes and parents accurately", () => {
    const text1 = makeText("Item 1");
    const text2 = makeText("Item 2");
    const innerFrame = makeFrame([text2], "Inner");
    const root = makeFrame([text1, innerFrame], "Root");

    expect(findNode(root, text1.id)?.id).toBe(text1.id);
    expect(findNode(root, text2.id)?.id).toBe(text2.id);
    expect(findNode(root, "non-existent")).toBeNull();

    const info1 = findNodeAndParent(root, text1.id);
    expect(info1.parent?.id).toBe(root.id);
    expect(info1.index).toBe(0);

    const info2 = findNodeAndParent(root, text2.id);
    expect(info2.parent?.id).toBe(innerFrame.id);
    expect(info2.index).toBe(0);
  });

  it("calculates ancestor IDs correctly", () => {
    const text = makeText("Deep Item");
    const frameC = makeFrame([text], "C");
    const frameB = makeFrame([frameC], "B");
    const frameA = makeFrame([frameB], "A");

    const ancestors = getAncestorIds(frameA, text.id);
    expect(ancestors).toEqual([frameA.id, frameB.id, frameC.id]);
  });

  it("prevents invalid drops and cycles", () => {
    const text1 = makeText("Item 1");
    const text2 = makeText("Item 2");
    const innerFrame = makeFrame([text2], "Inner");
    const root = makeFrame([text1, innerFrame], "Root");

    // Cannot drag root
    expect(canDropNode(root, root.id, innerFrame.id, "inside")).toBe(false);

    // Cannot drop on self
    expect(canDropNode(root, text1.id, text1.id, "before")).toBe(false);

    // Cannot drop parent inside descendant (cycle prevention)
    expect(canDropNode(root, innerFrame.id, text2.id, "inside")).toBe(false);
    expect(canDropNode(root, root.id, text2.id, "after")).toBe(false);

    // Cannot drop "inside" a leaf node
    expect(canDropNode(root, text1.id, text2.id, "inside")).toBe(false);

    // Valid drops
    expect(canDropNode(root, text1.id, innerFrame.id, "inside")).toBe(true);
    expect(canDropNode(root, text1.id, text2.id, "before")).toBe(true);
    expect(canDropNode(root, text1.id, text2.id, "after")).toBe(true);
  });

  it("reorders siblings before and after", () => {
    const text1 = makeText("First");
    const text2 = makeText("Second");
    const text3 = makeText("Third");
    const root = makeFrame([text1, text2, text3]);

    // Move text3 before text1
    const movedBefore = moveNode(root, text3.id, text1.id, "before") as FrameNode;
    expect(movedBefore.children.map((c) => c.id)).toEqual([text3.id, text1.id, text2.id]);

    // Move text1 after text2
    const movedAfter = moveNode(root, text1.id, text2.id, "after") as FrameNode;
    expect(movedAfter.children.map((c) => c.id)).toEqual([text2.id, text1.id, text3.id]);
  });

  it("reparents nodes across different frames", () => {
    const text1 = makeText("T1");
    const text2 = makeText("T2");
    const frame1 = makeFrame([text1], "F1");
    const frame2 = makeFrame([text2], "F2");
    const root = makeFrame([frame1, frame2], "Root");

    // Move text1 inside frame2
    const moved = moveNode(root, text1.id, frame2.id, "inside") as FrameNode;
    const updatedF1 = moved.children[0] as FrameNode;
    const updatedF2 = moved.children[1] as FrameNode;

    expect(updatedF1.children).toHaveLength(0);
    expect(updatedF2.children).toHaveLength(2);
    expect(updatedF2.children[1]?.id).toBe(text1.id);
  });

  it("renames nodes properly", () => {
    const text = makeText("Hello", "Old Name");
    const root = makeFrame([text], "Root Frame");

    const renamed = renameNode(root, text.id, "New Name") as FrameNode;
    expect(renamed.children[0]?.name).toBe("New Name");

    // Empty name sets undefined
    const blankRenamed = renameNode(root, text.id, "   ") as FrameNode;
    expect(blankRenamed.children[0]?.name).toBeUndefined();
  });

  it("duplicates nodes with new IDs", () => {
    const text = makeText("Original", "Item");
    const root = makeFrame([text], "Root");

    const { updatedRoot, newId } = duplicateNode(root, text.id);
    const frame = updatedRoot as FrameNode;

    expect(frame.children).toHaveLength(2);
    expect(newId).toBeDefined();
    expect(frame.children[1]?.id).toBe(newId);
    expect(frame.children[1]?.name).toBe("Item (Copy)");
  });

  it("checks descendant relationships and removal", () => {
    const text = makeText("Leaf", "Leaf");
    const innerFrame = makeFrame([text], "Inner");
    const root = makeFrame([innerFrame], "Root");

    expect(isDescendantOf(root, text.id, root.id)).toBe(true);
    expect(isDescendantOf(root, root.id, text.id)).toBe(false);

    const insertedText = makeText("Extra", "Extra");
    const withInsert = insertNode(root, innerFrame.id, insertedText) as FrameNode;
    const updatedInner = withInsert.children[0] as FrameNode;
    expect(updatedInner.children).toHaveLength(2);

    const afterRemove = removeNode(withInsert, text.id) as FrameNode;
    const innerAfterRemove = afterRemove.children[0] as FrameNode;
    expect(innerAfterRemove.children).toHaveLength(1);
    expect(innerAfterRemove.children[0]?.id).toBe(insertedText.id);
  });
});
