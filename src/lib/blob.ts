/** Base64 of a blob's bytes, without the "data:…;base64," prefix. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('Audio konnte nicht gelesen werden.'));
    reader.readAsDataURL(blob);
  });
}
