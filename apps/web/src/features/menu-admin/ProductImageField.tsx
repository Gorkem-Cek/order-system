import { useTranslation } from "react-i18next";
import { ImageField } from "../../components/ImageField";
import type { MenuActions } from "./useStaffMenu";

type ProductImageFieldProps = {
  productId: string;
  productName: string;
  imageUrl: string | null;
  uploadImage: MenuActions["uploadImage"];
  removeImage: MenuActions["removeImage"];
};

/** Photo of an existing product: upload, replace or remove. Saved immediately. */
export function ProductImageField({
  productId,
  productName,
  imageUrl,
  uploadImage,
  removeImage,
}: ProductImageFieldProps) {
  const { t } = useTranslation();
  return (
    <ImageField
      id={`image-${productId}`}
      label={t("productEditor.image.label")}
      alt={productName}
      imageUrl={imageUrl}
      onUpload={async (file) => (await uploadImage.mutateAsync({ id: productId, file })).imageUrl}
      onRemove={() => removeImage.mutateAsync(productId)}
    />
  );
}
