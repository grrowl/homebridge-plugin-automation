export function debounce<F extends (...args: any[]) => any>(
  func: F,
  waitFor: number,
) {
  let timeoutId: NodeJS.Timeout;

  // Convert the `func` into a new function that debounces `func`.
  return (...args: Parameters<F>): void => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), waitFor);
  };
}
