import type { FrameNode, LayoutNode, RepeaterNode } from "@mycharacter/contracts";

export interface NodeParentInfo {
  node: LayoutNode | null;
  parent: FrameNode | RepeaterNode | null;
  index: number;
}

export function findNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  if (root.kind === "frame") {
    for (const child of root.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  } else if (root.kind === "repeater") {
    return findNode(root.rowTemplate, id);
  }
  return null;
}

export function findNodeAndParent(
  root: LayoutNode,
  id: string,
  parent: FrameNode | RepeaterNode | null = null,
  index = -1,
): NodeParentInfo {
  if (root.id === id) {
    return { node: root, parent, index };
  }
  if (root.kind === "frame") {
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i];
      if (child) {
        const found = findNodeAndParent(child, id, root, i);
        if (found.node) return found;
      }
    }
  } else if (root.kind === "repeater") {
    const found = findNodeAndParent(root.rowTemplate, id, root, 0);
    if (found.node) return found;
  }
  return { node: null, parent: null, index: -1 };
}

/**
 * Returns array of ancestor node IDs from root down to the direct parent of targetId.
 */
export function getAncestorIds(
  root: LayoutNode,
  targetId: string,
  currentPath: string[] = [],
): string[] {
  if (root.id === targetId) {
    return currentPath;
  }
  if (root.kind === "frame") {
    for (const child of root.children) {
      const found = getAncestorIds(child, targetId, [...currentPath, root.id]);
      if (found.length > 0 || child.id === targetId) return found;
    }
  } else if (root.kind === "repeater") {
    const found = getAncestorIds(root.rowTemplate, targetId, [...currentPath, root.id]);
    if (found.length > 0 || root.rowTemplate.id === targetId) return found;
  }
  return [];
}

/**
 * Checks if candidateDescendantId is a descendant of candidateAncestorId.
 */
export function isDescendantOf(
  root: LayoutNode,
  candidateDescendantId: string,
  candidateAncestorId: string,
): boolean {
  if (candidateDescendantId === candidateAncestorId) return false;
  const ancestorNode = findNode(root, candidateAncestorId);
  if (!ancestorNode) return false;
  return findNode(ancestorNode, candidateDescendantId) !== null;
}

/**
 * Validates whether draggedId can be dropped onto targetId at the given position.
 */
export function canDropNode(
  root: LayoutNode,
  draggedId: string,
  targetId: string,
  position: "before" | "inside" | "after",
): boolean {
  if (draggedId === root.id) return false; // Root cannot be moved
  if (draggedId === targetId) return false; // Cannot drop onto self

  // Prevent circular hierarchy: dragged node cannot be an ancestor of target
  if (isDescendantOf(root, targetId, draggedId)) return false;

  const draggedInfo = findNodeAndParent(root, draggedId);
  if (!draggedInfo.node) return false;

  // If dragged node is a repeater's rowTemplate, it cannot be extracted from the repeater
  if (draggedInfo.parent && draggedInfo.parent.kind === "repeater" && draggedInfo.parent.rowTemplate.id === draggedId) {
    return false;
  }

  const targetInfo = findNodeAndParent(root, targetId);
  if (!targetInfo.node) return false;

  // Cannot drop before or after a repeater's rowTemplate (slot is fixed)
  if (
    (position === "before" || position === "after") &&
    targetInfo.parent &&
    targetInfo.parent.kind === "repeater" &&
    targetInfo.parent.rowTemplate.id === targetId
  ) {
    return false;
  }

  // "inside" drop is only allowed into a frame
  if (position === "inside") {
    return targetInfo.node.kind === "frame";
  }

  return true;
}

/**
 * Removes a node by ID from the tree.
 * Preserves structural integrity (e.g. cannot delete repeater rowTemplate).
 */
export function removeNode(root: LayoutNode, id: string): LayoutNode {
  if (root.id === id) return root;

  if (root.kind === "frame") {
    return {
      ...root,
      children: root.children
        .filter((child) => child.id !== id)
        .map((child) => removeNode(child, id)),
    };
  }

  if (root.kind === "repeater") {
    if (root.rowTemplate.id === id) {
      // Cannot delete repeater rowTemplate
      return root;
    }
    return {
      ...root,
      rowTemplate: removeNode(root.rowTemplate, id),
    };
  }

  return root;
}

/**
 * Inserts a node into a target parent Frame at the specified index.
 */
export function insertNode(
  root: LayoutNode,
  parentId: string,
  nodeToInsert: LayoutNode,
  index?: number,
): LayoutNode {
  if (root.id === parentId && root.kind === "frame") {
    const newChildren = [...root.children];
    if (typeof index === "number" && index >= 0 && index <= newChildren.length) {
      newChildren.splice(index, 0, nodeToInsert);
    } else {
      newChildren.push(nodeToInsert);
    }
    return {
      ...root,
      children: newChildren,
    };
  }

  if (root.kind === "frame") {
    return {
      ...root,
      children: root.children.map((child) =>
        insertNode(child, parentId, nodeToInsert, index),
      ),
    };
  }

  if (root.kind === "repeater") {
    return {
      ...root,
      rowTemplate: insertNode(root.rowTemplate, parentId, nodeToInsert, index),
    };
  }

  return root;
}

/**
 * Moves a node within the layout tree atomically.
 */
export function moveNode(
  root: LayoutNode,
  draggedId: string,
  targetId: string,
  position: "before" | "inside" | "after",
): LayoutNode {
  if (!canDropNode(root, draggedId, targetId, position)) {
    return root;
  }

  const draggedInfo = findNodeAndParent(root, draggedId);
  if (!draggedInfo.node) return root;
  const nodeToMove = draggedInfo.node;

  // Step 1: Remove the dragged node from its current position
  const treeWithoutNode = removeNode(root, draggedId);

  // Step 2: Determine insertion parent and index in the new tree
  if (position === "inside") {
    return insertNode(treeWithoutNode, targetId, nodeToMove);
  }

  const targetInfo = findNodeAndParent(treeWithoutNode, targetId);
  if (!targetInfo.parent || targetInfo.parent.kind !== "frame") {
    return root;
  }

  const insertIndex =
    position === "before" ? targetInfo.index : targetInfo.index + 1;

  return insertNode(treeWithoutNode, targetInfo.parent.id, nodeToMove, insertIndex);
}

/**
 * Renames a node in the tree.
 */
export function renameNode(root: LayoutNode, id: string, name: string): LayoutNode {
  const trimmed = name.trim();
  if (root.id === id) {
    return {
      ...root,
      name: trimmed || undefined,
    };
  }

  if (root.kind === "frame") {
    return {
      ...root,
      children: root.children.map((child) => renameNode(child, id, name)),
    };
  }

  if (root.kind === "repeater") {
    return {
      ...root,
      rowTemplate: renameNode(root.rowTemplate, id, name),
    };
  }

  return root;
}

function cloneNodeWithNewIds(node: LayoutNode): LayoutNode {
  const newId = crypto.randomUUID();
  if (node.kind === "frame") {
    return {
      ...node,
      id: newId,
      name: node.name ? `${node.name} (Copy)` : undefined,
      children: node.children.map(cloneNodeWithNewIds),
    };
  }
  if (node.kind === "repeater") {
    return {
      ...node,
      id: newId,
      name: node.name ? `${node.name} (Copy)` : undefined,
      rowTemplate: cloneNodeWithNewIds(node.rowTemplate),
    };
  }
  return {
    ...node,
    id: newId,
    name: node.name ? `${node.name} (Copy)` : undefined,
  };
}

/**
 * Duplicates a node in place next to itself.
 */
export function duplicateNode(
  root: LayoutNode,
  id: string,
): { updatedRoot: LayoutNode; newId: string | null } {
  if (root.id === id) return { updatedRoot: root, newId: null };

  const targetInfo = findNodeAndParent(root, id);
  if (!targetInfo.node || !targetInfo.parent || targetInfo.parent.kind !== "frame") {
    return { updatedRoot: root, newId: null };
  }

  const cloned = cloneNodeWithNewIds(targetInfo.node);
  const updatedRoot = insertNode(root, targetInfo.parent.id, cloned, targetInfo.index + 1);

  return { updatedRoot, newId: cloned.id };
}
