/**
 * Hands a file to the user. On iPhone the share sheet ("Save to Files") is the reliable way to get
 * a file out of a home-screen app; elsewhere it is a normal download.
 * Returns false when the user closed the share sheet without saving.
 */
export async function saveFile(name: string, text: string, type: string): Promise<boolean> {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

/** Opens the file picker and returns the text of the chosen file, or null when none was chosen. */
export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? file.text() : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
