import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ADMIN_CONTROL_CLASS,
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
  AdminCheck,
  AdminDescription,
} from "@/components/admin/AdminFields";
import { Button } from "@/components/ui/button";
import { LocalizedInputs } from "@/components/admin/LocalizedFields";
import { m } from "@/paraglide/messages";
import { categoryLabel } from "@/hooks/useCategories";
import { type ProductEditor, type ProductFormState } from "./useProductEditor";

interface ProductEditorFormProps {
  editor: ProductEditor;
}

/** The add/edit product form shown inside the products dialog. */
export function ProductEditorForm({ editor }: ProductEditorFormProps) {
  const {
    form,
    inclusions,
    bundleCandidates,
    textLanguage,
    setTextLanguage,
    editingId,
    categories,
  } = editor;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      noValidate
      id="event-product-editor"
    >
      <h3 className="text-base font-medium mb-2">{m.admin_editor_availability()}</h3>
      <div className="flex gap-2 flex-wrap mb-2">
        <AdminField className="max-w-30" controlId="product-price">
          <AdminLabel className="text-subtle text-sm mb-1">{m.admin_products_price()}</AdminLabel>
          <form.Field name="price">
            {(field) => (
              <AdminInput
                type="number"
                min={0}
                step="0.01"
                size="sm"
                className={ADMIN_CONTROL_CLASS}
                value={field.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </AdminField>
        <AdminField className="max-w-40" controlId="product-category">
          <AdminLabel className="text-subtle text-sm mb-1">
            {m.admin_products_category()}
          </AdminLabel>
          <form.Field name="category">
            {(field) => (
              <AdminSelect
                size="sm"
                className={ADMIN_CONTROL_CLASS}
                value={field.value}
                onValueChange={(e) => field.handleChange(e)}
                onBlur={field.handleBlur}
              >
                {categories.map((category) => (
                  <AdminOption key={category.key} value={category.key}>
                    {categoryLabel(categories, category.key) ?? category.key}
                  </AdminOption>
                ))}
              </AdminSelect>
            )}
          </form.Field>
        </AdminField>
      </div>

      <div className="flex flex-wrap gap-6 mb-1">
        <form.Field name="purchasable">
          {(field) => (
            <AdminCheck
              type="checkbox"
              id="product-purchasable"
              label={m.admin_products_purchasable_label()}
              checked={field.value}
              onCheckedChange={(e) => {
                const purchasable = e;
                field.handleChange(purchasable);
                if (!purchasable) form.setFieldValue("required", false);
              }}
            />
          )}
        </form.Field>
        <form.Field name="required">
          {(field) => (
            <form.Subscribe selector={(s) => s.values.purchasable}>
              {(purchasable) => (
                <AdminCheck
                  type="checkbox"
                  id="product-required"
                  label={m.admin_products_required_label()}
                  checked={field.value}
                  disabled={!purchasable}
                  onCheckedChange={(e) => field.handleChange(e)}
                />
              )}
            </form.Subscribe>
          )}
        </form.Field>
      </div>
      <div className="text-subtle text-sm mb-1">{m.admin_products_purchasable_help()}</div>
      <form.Subscribe selector={(s) => s.values.purchasable}>
        {(purchasable) => (
          <div className="text-subtle text-sm mb-2">
            {purchasable
              ? m.admin_products_required_help()
              : m.admin_products_required_needs_purchasable()}
          </div>
        )}
      </form.Subscribe>

      <div className="flex gap-2 flex-wrap mb-2">
        <AdminField className="max-w-40" controlId="product-unit">
          <AdminLabel className="text-subtle text-sm mb-1">{m.admin_inventory_unit()}</AdminLabel>
          <form.Field name="unit">
            {(field) => (
              <AdminSelect
                size="sm"
                className={ADMIN_CONTROL_CLASS}
                value={field.value}
                onValueChange={(e) => field.handleChange(e as ProductFormState["unit"])}
                onBlur={field.handleBlur}
              >
                <AdminOption value="item">{m.admin_inventory_unit_item()}</AdminOption>
                <AdminOption value="person">{m.admin_inventory_unit_person()}</AdminOption>
                <AdminOption value="table">{m.admin_inventory_unit_table()}</AdminOption>
              </AdminSelect>
            )}
          </form.Field>
        </AdminField>
        <AdminField className="max-w-40" controlId="product-stock">
          <AdminLabel className="text-subtle text-sm mb-1">{m.admin_inventory_stock()}</AdminLabel>
          <form.Field name="stock">
            {(field) => (
              <AdminInput
                type="number"
                min={0}
                step={1}
                size="sm"
                className={ADMIN_CONTROL_CLASS}
                value={field.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </AdminField>
      </div>
      <AdminDescription className="block mb-2">
        {m.admin_inventory_unlimited_help()}
      </AdminDescription>
      <p className="text-sm text-subtle mb-4">{m.admin_products_text_help()}</p>
      <Tabs value={textLanguage} onValueChange={(value) => setTextLanguage(String(value))}>
        <TabsList aria-label={m.admin_editor_text()}>
          {(["nl", "fr", "en"] as const).map((language) => (
            <TabsTrigger key={language} value={language}>
              {language.toUpperCase()}
            </TabsTrigger>
          ))}
        </TabsList>
        {(["nl", "fr", "en"] as const).map((language) => (
          <TabsContent key={language} value={language} keepMounted>
            <form.Field name="name">
              {(field) => (
                <LocalizedInputs
                  language={language}
                  idPrefix="product-name"
                  label={(language) => m.admin_products_name_in({ language })}
                  values={field.value}
                  onChange={(language, text) =>
                    field.handleChange({ ...field.value, [language]: text })
                  }
                />
              )}
            </form.Field>
            <form.Field name="description">
              {(field) => (
                <LocalizedInputs
                  language={language}
                  idPrefix="product-description"
                  label={(language) => m.admin_products_description_in({ language })}
                  values={field.value}
                  maxLength={300}
                  onChange={(language, text) =>
                    field.handleChange({ ...field.value, [language]: text })
                  }
                />
              )}
            </form.Field>
          </TabsContent>
        ))}
      </Tabs>
      <fieldset className="mb-4">
        <legend className="text-base font-medium leading-tight">
          {m.admin_inventory_inclusions()}
        </legend>
        {inclusions.map((edge, index) => (
          <div className="flex flex-wrap gap-2 mb-2 items-start" key={index}>
            <AdminSelect
              size="sm"
              className="bg-muted text-content border-input min-w-45 grow-2 shrink-1 basis-45"

              aria-label={m.admin_products_bundle_target()}
              value={edge.product_id}
              onValueChange={(e) =>
                form.setFieldValue(`inclusions[${index}]`, {
                  ...edge,
                  product_id: e,
                })
              }
            >
              <AdminOption value="">{m.admin_products_bundle_none()}</AdminOption>
              {bundleCandidates.map((p) => (
                <AdminOption value={p.id} key={p.id}>
                  {p.name}
                </AdminOption>
              ))}
            </AdminSelect>
            <AdminInput
              type="number"
              min={1}
              step={1}
              size="sm"
              className="bg-muted text-content border-input max-w-22.5"

              aria-label={m.admin_inventory_included_quantity()}
              value={edge.quantity}
              onChange={(e) =>
                form.setFieldValue(`inclusions[${index}]`, {
                  ...edge,
                  quantity: Number(e.target.value),
                })
              }
            />
            <AdminInput
              type="number"
              min={1}
              step={1}
              size="sm"
              className="bg-muted text-content border-input max-w-22.5"

              aria-label={m.admin_inventory_per_quantity()}
              value={edge.per_quantity}
              onChange={(e) =>
                form.setFieldValue(`inclusions[${index}]`, {
                  ...edge,
                  per_quantity: Number(e.target.value),
                })
              }
            />
            <AdminSelect
              size="sm"
              className="bg-muted text-content border-input max-w-40"

              aria-label={m.admin_inventory_basis()}
              value={edge.basis}
              onValueChange={(e) =>
                form.setFieldValue(`inclusions[${index}]`, {
                  ...edge,
                  basis: e as "quantity" | "guests",
                })
              }
            >
              <AdminOption value="quantity">{m.admin_inventory_basis_quantity()}</AdminOption>
              <AdminOption value="guests">{m.admin_inventory_basis_guests()}</AdminOption>
            </AdminSelect>
            <AdminSelect
              size="sm"
              className="bg-muted text-content border-input max-w-35"

              aria-label={m.admin_inventory_rounding()}
              value={edge.rounding}
              onValueChange={(e) =>
                form.setFieldValue(`inclusions[${index}]`, {
                  ...edge,
                  rounding: e as "up" | "down",
                })
              }
            >
              <AdminOption value="down">{m.admin_inventory_round_down()}</AdminOption>
              <AdminOption value="up">{m.admin_inventory_round_up()}</AdminOption>
            </AdminSelect>
            <Button
              type="button"
              size="sm"
              variant="outline-danger"
              onClick={() => void form.removeFieldValue("inclusions", index)}
            >
              {m.admin_inventory_remove()}
            </Button>
          </div>
        ))}
        <AdminDescription className="block mb-2">{m.admin_inventory_ratio_help()}</AdminDescription>
        <AdminDescription className="block mb-2">
          {m.admin_inventory_hidden_target_help()}
        </AdminDescription>
        <Button
          type="button"
          onClick={() =>
            form.pushFieldValue("inclusions", {
              product_id: "",
              quantity: 1,
              per_quantity: 1,
              rounding: "down",
              basis: "quantity",
            })
          }
        >
          {m.admin_inventory_add_inclusion()}
        </Button>
      </fieldset>
      {editingId && (
        <fieldset className="mb-4">
          <legend className="text-base font-medium leading-tight">
            {m.admin_inventory_existing_bookings()}
          </legend>
          <form.Field name="updateExistingContents">
            {(field) => (
              <AdminCheck
                id="update-booked-contents"
                label={m.admin_inventory_update_contents()}
                checked={field.value}
                onCheckedChange={(e) => field.handleChange(e)}
              />
            )}
          </form.Field>
          <form.Field name="updateExistingPrices">
            {(field) => (
              <AdminCheck
                id="update-booked-prices"
                label={m.admin_inventory_update_prices()}
                checked={field.value}
                onCheckedChange={(e) => field.handleChange(e)}
              />
            )}
          </form.Field>
          <AdminDescription>{m.admin_inventory_keep_help()}</AdminDescription>
        </fieldset>
      )}
    </form>
  );
}
