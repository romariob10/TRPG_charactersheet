import type {
  BlockTool,
  BlockToolConstructorOptions,
  ToolConstructable,
} from "@editorjs/editorjs";

export interface EntityOption {
  id: string;
  title: string;
  gameSystem: string | null;
}

interface EntityToolConfig {
  options: EntityOption[];
  emptyText: string;
  selectText: string;
  title: string;
}

interface EntityToolData {
  characterId?: string;
  templateId?: string;
}

export function createEntityTool(
  kind: "character" | "system",
  config: EntityToolConfig,
): ToolConstructable {
  return class EntityBlockTool implements BlockTool {
    static get toolbox() {
      return {
        title: config.title,
        icon:
          kind === "character"
            ? '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
            : '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
      };
    }

    private readonly wrapper: HTMLDivElement;
    private readonly select: HTMLSelectElement;

    constructor({ data }: BlockToolConstructorOptions<EntityToolData>) {
      this.wrapper = document.createElement("div");
      this.wrapper.className = "editor-entity-block";
      const label = document.createElement("span");
      label.className = "editor-entity-block__label";
      label.textContent = config.title;
      this.select = document.createElement("select");
      this.select.className = "editor-entity-block__select";
      this.select.setAttribute("aria-label", config.selectText);
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = config.options.length
        ? config.selectText
        : config.emptyText;
      placeholder.disabled = true;
      placeholder.selected = true;
      this.select.append(placeholder);
      for (const option of config.options) {
        const element = document.createElement("option");
        element.value = option.id;
        element.textContent = option.gameSystem
          ? `${option.title} · ${option.gameSystem}`
          : option.title;
        this.select.append(element);
      }
      const selectedId =
        kind === "character" ? data.characterId : data.templateId;
      if (selectedId) this.select.value = selectedId;
      this.wrapper.append(label, this.select);
    }

    render(): HTMLElement {
      return this.wrapper;
    }

    save(): EntityToolData {
      return kind === "character"
        ? { characterId: this.select.value }
        : { templateId: this.select.value };
    }

    validate(data: EntityToolData): boolean {
      return Boolean(kind === "character" ? data.characterId : data.templateId);
    }
  } as ToolConstructable;
}
