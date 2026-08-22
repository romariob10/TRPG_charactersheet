"use client";

import React, { createContext, useContext } from "react";
import type {
  CharacterRepeaterRow,
  ComponentVersionDetails,
  FieldValue,
  TargetLayoutKind,
} from "@mycharacter/contracts";

export type SheetRenderMode = "builder" | "player" | "readonly" | "print";

export interface SheetRenderContextValue {
  target: TargetLayoutKind;
  mode: SheetRenderMode;
  fieldValues?: Record<string, FieldValue>;
  onFieldValueChange?: (fieldBinding: string, value: FieldValue) => void;
  repeaterRows?: Record<string, CharacterRepeaterRow[]>;
  onAddRepeaterRow?: (repeaterKey: string) => Promise<void> | void;
  onUpdateRepeaterRowField?: (
    repeaterKey: string,
    rowId: string,
    slotId: string,
    value: unknown,
    expectedVersion: number,
  ) => Promise<void> | void;
  onRemoveRepeaterRow?: (
    repeaterKey: string,
    rowId: string,
  ) => Promise<void> | void;
  onReorderRepeaterRows?: (
    repeaterKey: string,
    rowIds: string[],
  ) => Promise<void> | void;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  resolvedComponents?: Map<string, ComponentVersionDetails>;
}

const SheetRenderContext = createContext<SheetRenderContextValue>({
  target: "desktop",
  mode: "player",
});

export const useSheetRender = () => useContext(SheetRenderContext);

export const SheetRenderProvider: React.FC<{
  value: SheetRenderContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return (
    <SheetRenderContext.Provider value={value}>
      {children}
    </SheetRenderContext.Provider>
  );
};
