import {
  ADMIN_CONTROL_CLASS,
  ADMIN_LABEL_CLASS,
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
  AdminOptionGroup,
} from "@/components/admin/AdminFields";
import { Button } from "@/components/ui/button";
import { AreaIcon } from "@/components/AreaIcon";
import { Grid3x3Icon, RotateCcwIcon, RotateCwIcon, TrashIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import type { FloorTable, FloorArea } from "@/api-types";
import { RowActionDivider } from "@/components/admin/RowActions";
import { getAreaIcons } from "./areaIcons";
import { type ItemRef } from "./layoutTypes";

interface AreaInspectorCardProps {
  area: FloorArea;
  organizations: ItemRef[];
  tablesInArea: FloorTable[];
  assignAreaError: string | null;
  setAssignAreaError: (message: string | null) => void;
  resizeAreaError: string | null;
  setResizeAreaError: (message: string | null) => void;
  onRotateArea: (areaId: string, rotation: number) => void;
  onUpdateAreaLabel: (areaId: string, label: string) => void;
  onResizeArea: (areaId: string, widthM: number, lengthM: number) => Promise<void>;
  onAssignAreaToItem: (
    areaId: string,
    organizationId: number | null,
    label?: string,
    icon?: string,
  ) => Promise<void>;
  onRequestDelete: (areaId: string) => void;
}

export function AreaInspectorCard({
  area: selectedAreaData,
  organizations,
  tablesInArea: tablesInSelectedArea,
  assignAreaError,
  setAssignAreaError,
  resizeAreaError,
  setResizeAreaError,
  onRotateArea,
  onUpdateAreaLabel,
  onResizeArea,
  onAssignAreaToItem,
  onRequestDelete,
}: AreaInspectorCardProps) {
  return (
    <Card tone="info" className="mb-4">
      <CardHeader className="flex flex-wrap gap-2 items-center justify-between border-info">
        <span className="font-semibold">
          <AreaIcon name={selectedAreaData.icon} className="me-2" />
          {m.admin_layout_area_label_prefix()} {selectedAreaData.label}
        </span>
        <div className="flex gap-2 items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRotateArea(selectedAreaData.id, selectedAreaData.rotation - 15)}
            title={m.admin_layout_rotate_ccw()}
            aria-label={m.admin_layout_rotate_ccw()}
          >
            <Icon icon={RotateCcwIcon} />
          </Button>
          <span className="text-subtle text-sm min-w-14 text-center">
            {Math.round(selectedAreaData.rotation)}°
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRotateArea(selectedAreaData.id, selectedAreaData.rotation + 15)}
            title={m.admin_layout_rotate_cw()}
            aria-label={m.admin_layout_rotate_cw()}
          >
            <Icon icon={RotateCwIcon} />
          </Button>
          <RowActionDivider />
          <Button
            variant="outline-danger"
            size="sm"
            onClick={() => onRequestDelete(selectedAreaData.id)}
            title={m.admin_delete_item({ name: selectedAreaData.label })}
            aria-label={m.admin_delete_item({ name: selectedAreaData.label })}
          >
            <Icon icon={TrashIcon} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {assignAreaError && (
          <Alert
            role="alert"
            aria-live="assertive"
            variant="danger"
            className="py-1 mb-2 text-sm"
            onClose={() => setAssignAreaError(null)}
          >
            {assignAreaError}
          </Alert>
        )}
        {resizeAreaError && (
          <Alert
            role="alert"
            aria-live="assertive"
            variant="danger"
            className="py-1 mb-2 text-sm"
            onClose={() => setResizeAreaError(null)}
          >
            {resizeAreaError}
          </Alert>
        )}
        <AdminField className="mb-4" controlId="area-label">
          <AdminLabel className={ADMIN_LABEL_CLASS}>{m.admin_layout_area_form_label()}</AdminLabel>
          <AdminInput
            size="sm"
            type="text"
            className={ADMIN_CONTROL_CLASS}
            defaultValue={selectedAreaData.label}
            onBlur={(e) => {
              const newLabel = e.target.value.trim();
              if (newLabel && newLabel !== selectedAreaData.label) {
                onUpdateAreaLabel(selectedAreaData.id, newLabel);
              }
            }}
            key={selectedAreaData.id}
          />
        </AdminField>
        <div className="flex gap-2 mb-4">
          <AdminField controlId="area-width" className="flex-1">
            <AdminLabel className={ADMIN_LABEL_CLASS}>{m.admin_layout_area_width_m()}</AdminLabel>
            <AdminInput
              size="sm"
              type="number"
              min={0.1}
              max={50}
              step={0.1}
              className={ADMIN_CONTROL_CLASS}
              defaultValue={selectedAreaData.width_m}
              onBlur={async (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0 && val !== selectedAreaData.width_m) {
                  setResizeAreaError(null);
                  try {
                    await onResizeArea(selectedAreaData.id, val, selectedAreaData.length_m);
                  } catch (err) {
                    setResizeAreaError(apiErrorMessage(err, m.admin_content_error_save()));
                  }
                }
              }}
              key={`w-${selectedAreaData.id}`}
            />
          </AdminField>
          <AdminField controlId="area-length" className="flex-1">
            <AdminLabel className={ADMIN_LABEL_CLASS}>{m.admin_layout_area_length_m()}</AdminLabel>
            <AdminInput
              size="sm"
              type="number"
              min={0.1}
              max={50}
              step={0.1}
              className={ADMIN_CONTROL_CLASS}
              defaultValue={selectedAreaData.length_m}
              onBlur={async (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0 && val !== selectedAreaData.length_m) {
                  setResizeAreaError(null);
                  try {
                    await onResizeArea(selectedAreaData.id, selectedAreaData.width_m, val);
                  } catch (err) {
                    setResizeAreaError(apiErrorMessage(err, m.admin_content_error_save()));
                  }
                }
              }}
              key={`l-${selectedAreaData.id}`}
            />
          </AdminField>
        </div>
        <AdminField className="mb-4" controlId="area-icon">
          <AdminLabel className={ADMIN_LABEL_CLASS}>{m.admin_layout_area_form_icon()}</AdminLabel>
          <div className="flex gap-2 items-center">
            <AreaIcon name={selectedAreaData.icon} className="text-primary" />
            <AdminSelect
              size="sm"
              className={ADMIN_CONTROL_CLASS}
              value={selectedAreaData.icon || "bi-shop"}
              onValueChange={async (e) => {
                const newIcon = e;
                setAssignAreaError(null);
                try {
                  await onAssignAreaToItem(
                    selectedAreaData.id,
                    selectedAreaData.organization_id,
                    undefined,
                    newIcon,
                  );
                } catch (err) {
                  setAssignAreaError(apiErrorMessage(err, m.admin_content_error_save()));
                }
              }}
              key={`icon-${selectedAreaData.id}`}
            >
              {getAreaIcons().map((ic) => (
                <AdminOption key={ic.value} value={ic.value}>
                  {ic.label}
                </AdminOption>
              ))}
            </AdminSelect>
          </div>
        </AdminField>
        <AdminField controlId="area-assign-item">
          <AdminLabel className={ADMIN_LABEL_CLASS}>{m.admin_layout_area_assigned_to()}</AdminLabel>
          <AdminSelect
            size="sm"
            className={ADMIN_CONTROL_CLASS}
            value={selectedAreaData.organization_id ? `e:${selectedAreaData.organization_id}` : ""}
            onValueChange={async (ev) => {
              const val = ev;
              setAssignAreaError(null);
              try {
                let eId: number | null = null;
                if (val.startsWith("e:")) {
                  eId = Number(val.slice(2));
                }
                await onAssignAreaToItem(selectedAreaData.id, eId);
              } catch (err) {
                setAssignAreaError(apiErrorMessage(err, m.admin_content_error_save()));
              }
            }}
          >
            <AdminOption value="">{m.admin_layout_area_none()}</AdminOption>
            {organizations.filter((e) => e.active).length > 0 && (
              <AdminOptionGroup label={m.admin_layout_area_organizations_group()}>
                {organizations
                  .filter((e) => e.active)
                  .map((e) => (
                    <AdminOption key={e.id} value={`e:${e.id}`}>
                      {e.name}
                    </AdminOption>
                  ))}
              </AdminOptionGroup>
            )}
          </AdminSelect>
        </AdminField>
        {tablesInSelectedArea.length > 0 && (
          <div className="mt-4 pt-4 border-t border-subtle">
            <p className="text-subtle text-sm mb-2">
              <Icon icon={Grid3x3Icon} className="me-1" />
              {m.admin_layout_tables_in_stand()}{" "}
              <Badge variant="info">{tablesInSelectedArea.length}</Badge>
              <span className="ms-2 text-subtle">
                {tablesInSelectedArea.reduce((s, t) => s + t.capacity, 0)}{" "}
                {m.admin_layout_places_total()}
              </span>
            </p>
            <PresentationList flush>
              {tablesInSelectedArea.map((t) => (
                <PresentationListItem key={t.id} className="py-1 px-2 text-sm">
                  <Icon icon={Grid3x3Icon} className="me-1 text-muted-foreground" />
                  {t.name}
                  <Badge variant="secondary" className="ms-2 text-micro">
                    {t.capacity} {m.admin_layout_capacity_abbrev()}
                  </Badge>
                </PresentationListItem>
              ))}
            </PresentationList>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
