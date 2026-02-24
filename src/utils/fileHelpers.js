export function validateImageFile() {
  return {
    valid: false,
    error:
      "React Native'da webdagi fayl input ishlamaydi. Rasm uchun URL kiriting yoki image-picker kutubxonasini ulang.",
  };
}

export async function convertToBase64() {
  throw new Error(
    "React Native variantida convertToBase64 ishlatilmaydi. Buning o'rniga rasm URL yoki image-picker dan foydalaning."
  );
}
