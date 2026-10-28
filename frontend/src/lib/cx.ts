/** Joins truthy class names. Avoids pulling in a classnames dependency. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
