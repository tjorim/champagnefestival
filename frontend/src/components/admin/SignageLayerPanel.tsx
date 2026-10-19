import { AdminEmptyState } from "./AdminEmptyState";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  ImageIcon,
  LockIcon,
  LockOpenIcon,
  ShapesIcon,
  SmileIcon,
  TypeIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { AdminField, AdminLabel, AdminSelect, AdminOption, AdminOptionGroup } from "./AdminFields";
import { m } from "@/paraglide/messages";
import type { Layer } from "@/signage/types";

interface Props {
  layers: Layer[];
  selected: string | null;
  busy: boolean;
  bindingLabels: Record<NonNullable<Layer["binding"]>, string>;
  kindLabels: Record<string, string>;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<Layer>) => void;
  onMove: (from: number, to: number) => void;
  onAdd: (kind: Layer["kind"], binding?: Layer["binding"]) => void;
}

function LayerRow({
  item,
  index,
  count,
  name,
  selected,
  busy,
  onSelect,
  onPatch,
  onMove,
}: {
  item: Layer;
  index: number;
  count: number;
  name: string;
} & Pick<Props, "selected" | "busy" | "onSelect" | "onPatch" | "onMove">) {
  const { ref, handleRef, isDragging } = useSortable({
    id: item.id,
    index,
    disabled: busy || !!item.locked,
  });
  const visible = item.visible !== false;
  const typeIcon =
    item.kind === "image" || (item.kind === "binding" && item.binding === "logo")
      ? ImageIcon
      : item.kind === "shape"
        ? ShapesIcon
        : item.kind === "icon" || (item.kind === "binding" && item.binding === "icon")
          ? SmileIcon
          : TypeIcon;
  return (
    <li
      ref={ref}
      data-layer-id={item.id}
      data-dragging={isDragging || undefined}
      className="rounded-md border border-border bg-muted p-1 data-dragging:shadow-md"
    >
      <div className="flex items-center gap-1">
        <Button
          ref={handleRef}
          variant="ghost"
          size="icon-sm"
          className="cursor-grab touch-none"
          disabled={busy || !!item.locked}
          aria-label={m.signage_editor_drag_layer({ name })}
        >
          <Icon icon={GripVerticalIcon} />
        </Button>
        <Button
          variant={selected === item.id ? "default" : "ghost"}
          className="min-w-0 flex-1 justify-start aria-pressed:hover:bg-primary"
          aria-pressed={selected === item.id}
          disabled={busy}
          onClick={() => onSelect(item.id)}
          title={name}
        >
          <Icon icon={typeIcon} />
          <span className="truncate">{name}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy || !!item.locked}
          aria-label={m.signage_editor_layer_visible({ name })}
          aria-pressed={visible}
          title={m.signage_editor_layer_visible({ name })}
          onClick={() => onPatch(item.id, { visible: !visible })}
        >
          <Icon icon={visible ? EyeIcon : EyeOffIcon} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label={m.signage_editor_layer_locked({ name })}
          aria-pressed={item.locked ?? false}
          title={m.signage_editor_layer_locked({ name })}
          onClick={() => onPatch(item.id, { locked: !item.locked })}
        >
          <Icon icon={item.locked ? LockIcon : LockOpenIcon} />
        </Button>
      </div>
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy || !!item.locked || index === 0}
          aria-label={m.signage_editor_layer_front({ name })}
          title={m.signage_editor_layer_front({ name })}
          onClick={() => onMove(index, index - 1)}
        >
          <Icon icon={ArrowUpIcon} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy || !!item.locked || index === count - 1}
          aria-label={m.signage_editor_layer_back({ name })}
          title={m.signage_editor_layer_back({ name })}
          onClick={() => onMove(index, index + 1)}
        >
          <Icon icon={ArrowDownIcon} />
        </Button>
      </div>
    </li>
  );
}

export default function SignageLayerPanel({
  layers,
  selected,
  busy,
  bindingLabels,
  kindLabels,
  onSelect,
  onPatch,
  onMove,
  onAdd,
}: Props) {
  // The renderer stores back to front; visual editors list the frontmost layer first.
  const display = [...layers].reverse();
  const move = (from: number, to: number) =>
    onMove(layers.length - 1 - from, layers.length - 1 - to);
  return (
    <section aria-label={m.signage_editor_layers()} className="min-w-0 space-y-3">
      <h3 className="font-semibold">{m.signage_editor_layers()}</h3>
      <p className="text-sm text-subtle">{m.signage_editor_layers_help()}</p>
      <AdminField>
        <AdminLabel>{m.signage_editor_add()}</AdminLabel>
        <AdminSelect
          value=""
          disabled={busy || layers.length >= 100}
          onValueChange={(value) => {
            if (value.startsWith("binding:")) onAdd("binding", value.slice(8) as Layer["binding"]);
            else onAdd(value as Layer["kind"]);
          }}
        >
          <AdminOptionGroup label={m.signage_editor_binding()}>
            {Object.entries(bindingLabels).map(([binding, label]) => (
              <AdminOption key={binding} value={`binding:${binding}`}>
                {m.signage_editor_placeholder_option({ name: label })}
              </AdminOption>
            ))}
          </AdminOptionGroup>
          <AdminOptionGroup label={m.signage_editor_static_content()}>
            {["text", "image", "icon", "shape"].map((kind) => (
              <AdminOption key={kind} value={kind}>
                {kindLabels[kind]}
              </AdminOption>
            ))}
          </AdminOptionGroup>
        </AdminSelect>
      </AdminField>
      {layers.length >= 100 && (
        <p className="text-sm text-subtle">{m.signage_editor_layer_limit()}</p>
      )}
      {layers.length === 0 && <AdminEmptyState>{m.signage_editor_layers_empty()}</AdminEmptyState>}
      <DragDropProvider
        onDragEnd={(event) => {
          if (event.canceled || busy) return;
          const { source } = event.operation;
          if (isSortable(source) && source.initialIndex !== source.index)
            move(source.initialIndex, source.index);
        }}
      >
        <ul
          className="m-0 flex max-h-96 list-none flex-col gap-2 overflow-y-auto p-1"
          aria-label={m.signage_editor_layers()}
        >
          {display.map((item, index) => (
            <LayerRow
              key={item.id}
              item={item}
              index={index}
              count={layers.length}
              name={
                item.name ||
                (item.binding && item.kind === "binding" && bindingLabels[item.binding]) ||
                (item.kind === "text" && item.text) ||
                `${kindLabels[item.kind]} ${layers.length - index}`
              }
              selected={selected}
              busy={busy}
              onSelect={onSelect}
              onPatch={onPatch}
              onMove={move}
            />
          ))}
        </ul>
      </DragDropProvider>
    </section>
  );
}
