import type { LayoutNode, SheetFieldDefinition } from "./sheet-blueprints.js";

export function ensureBoundFieldDefinitions(
  layouts: Record<string, LayoutNode>,
  fields: SheetFieldDefinition[],
): SheetFieldDefinition[] {
  const result = [...fields];
  const keys = new Set(result.map((field) => field.key));
  const visit = (node: LayoutNode): void => {
    if (node.kind === "table") {
      for (let row = 0; row < node.rows; row += 1) {
        for (let column = 0; column < node.columns; column += 1) {
          if (row < node.headerRows || column < node.headerColumns) continue;
          const key = `${node.fieldBindingPrefix}_${row}_${column}`;
          if (keys.has(key)) continue;
          result.push({
            id: crypto.randomUUID(),
            key,
            label: node.cellLabels[row * node.columns + column] || `${node.name || "Table"} ${row + 1}:${column + 1}`,
            kind: "text",
            options: [],
            readOnly: node.readOnly,
          });
          keys.add(key);
        }
      }
    }
    if ("fieldBinding" in node && !keys.has(node.fieldBinding)) {
      const kind = node.kind === "image" ? "avatar"
        : node.kind === "number-input" ? "number"
        : node.kind === "checkbox" ? "checkbox"
        : node.kind === "select" ? "select"
        : node.kind === "textarea" ? "multiline" : "text";
      result.push({
        id: crypto.randomUUID(),
        key: node.fieldBinding,
        label: ("label" in node && node.label) || node.name || node.fieldBinding,
        kind,
        options: node.kind === "select" ? node.options.map((option) => option.value) : [],
        readOnly: node.kind === "image" ? false : node.readOnly,
      });
      keys.add(node.fieldBinding);
    }
    if (node.kind === "textarea") node.itemCheckboxBindings?.forEach((key, index) => {
      if (keys.has(key)) return;
      result.push({ id: crypto.randomUUID(), key, label: node.itemLabels?.[index] || `${node.name || node.fieldBinding} ${index + 1}`,
        kind: "checkbox", defaultValue: false, options: [], readOnly: node.readOnly });
      keys.add(key);
    });
    if ("children" in node) node.children.forEach(visit);
    if ("rowTemplate" in node) visit(node.rowTemplate);
  };
  Object.values(layouts).forEach(visit);
  return result;
}
